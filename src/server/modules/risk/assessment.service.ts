import "server-only";
import { Prisma, type RiskAssessmentStatus } from "@/generated/prisma/client";
import { pendingUploads, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import type { RiskFormSettings } from "@/lib/forms/settings";
import { checkHazardNames } from "@/lib/risk/hazard-options";
import { CHECKLIST_RESULTS, hazardWordTitle, type AssessmentStatus, type ChecklistResultKey } from "@/lib/risk/labels";
import { FMEA_FACTORS, type RiskBand, type RiskMethod } from "@/lib/risk/scoring";
import type { AssessmentCreateInput, AssessmentDecision, AssessmentUpdateInput, HazardInput, PeriodicReviewInput } from "@/lib/validation/risk";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ForbiddenError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { formAvailableAtSite } from "@/server/modules/forms/form.service";
import { listLabel } from "@/server/modules/incidents/incident-lookups";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { numberingService } from "@/server/modules/numbering/numbering.service";
import { resolvePlacement, type ResolvedPlacement } from "@/server/modules/organisation/placement";
import { recordLinkService } from "@/server/modules/record-links/record-link.service";
import { uploadService } from "@/server/modules/uploads/upload.service";
import { requireTenantId } from "@/server/tenancy/context";
import { asAnswers, asSnapshot, captureRiskForm, checkRiskAnswers, composeAnswers, readRules, rulesOf } from "./forms";
import { formIdOfVersion, hazardOptionsOf } from "./hazard-options.service";
import type { HazardSnapshot } from "./risk.dto";
import {
  assessmentVisibleWhere,
  canApproveAssessment,
  canArchiveAssessment,
  canCreateAssessmentAt,
  canEditAssessment,
  canReviewAssessment,
  seesConfidentialFlag,
  type AssessmentRecordFacts,
} from "./risk-access.policy";
import { classify, matrixCell, scoreAssessment, scoreHazard, type HazardValues } from "./scoring";
import { ASSESSMENT_ENTITY, assessmentHref, assertActiveUsers, blocked, dateOnly, json, newLabelId, RELATED_KIND, toDate, todayFor } from "./support";
import { commandBlockers, draftBlockers, nextRevision, relatedLinkBlockers, restoredStatus, reviewBlockers, submitBlockers, type AssessmentFacts } from "./workflow";

/**
 * Risk assessment lifecycle: create (draft / submit / save & approve), edit, submit, approve
 * (revision + retained snapshot), start a draft revision, archive → restore as Draft, clone,
 * periodic review (no rescoring) and related-assessment links. Every mutation is audited in its
 * transaction; gates answer 422 with `details.blockers`.
 */

export const RISK_AUDIT = {
  DRAFT_SAVED: "RISK_DRAFT_SAVED",
  UPDATED: "RISK_UPDATED",
  SUBMITTED: "RISK_SUBMITTED",
  APPROVED: "RISK_APPROVED",
  REVISION_STARTED: "RISK_REVISION_STARTED",
  ARCHIVED: "RISK_ARCHIVED",
  RESTORED: "RISK_RESTORED",
  CLONED: "RISK_CLONED",
  REVIEWED: "RISK_REVIEWED",
  RESCORED: "RISK_RESCORED",
  RELATED_LINKED: "RISK_RELATED_LINKED",
  RELATED_UNLINKED: "RISK_RELATED_UNLINKED",
  PDF_CREATED: "RISK_ASSESSMENT_PDF_CREATED",
} as const;

export interface AssessmentWriteResult {
  id: string;
  reference: string;
  status: AssessmentStatus;
  revision: number;
  created: boolean;
}

export const assessmentRecordSelect = {
  id: true,
  reference: true,
  labelId: true,
  version: true,
  title: true,
  description: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
  ownerId: true,
  approverId: true,
  reviewDate: true,
  participantIds: true,
  itemType: true,
  itemIdentity: true,
  operationMode: true,
  workArea: true,
  peopleExposed: true,
  impactContext: true,
  status: true,
  revision: true,
  form: true,
  formVersionId: true,
  method: true,
  domain: true,
  rules: true,
  answers: true,
  currentScore: true,
  band: true,
  isConfidential: true,
  createdById: true,
  archivedAt: true,
  hazards: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.RiskAssessmentSelect;

export type AssessmentRow = Prisma.RiskAssessmentGetPayload<{ select: typeof assessmentRecordSelect }>;

export function assessmentFacts(row: Pick<AssessmentRow, "businessUnitId" | "siteId" | "locationId" | "departmentId" | "ownerId" | "approverId" | "createdById" | "status">): AssessmentRecordFacts {
  return {
    businessUnitId: row.businessUnitId,
    siteId: row.siteId,
    locationId: row.locationId,
    departmentId: row.departmentId,
    ownerId: row.ownerId,
    approverId: row.approverId,
    createdById: row.createdById,
    status: row.status,
  };
}

/** Loads an assessment the user may see (404 otherwise). */
export async function loadVisibleAssessment(db: DbClient, user: CurrentUser, id: string): Promise<AssessmentRow> {
  const row = await db.riskAssessment.findFirst({ where: { AND: [{ id }, assessmentVisibleWhere(user)] }, select: assessmentRecordSelect });
  if (!row) throw new NotFoundError();
  return row;
}

// ── Hazards ─────────────────────────────────────────────────────────────────

interface PreparedHazard {
  id: string | null;
  activity: string;
  name: string;
  consequence: string;
  controls: string;
  recommendation: string | null;
  justification: string;
  likelihood: number | null;
  severity: number | null;
  factors: Record<string, number> | null;
  checklistResult: ChecklistResultKey | null;
  score: number | null;
}

/** Keeps only the values the method uses (FMEA factor keys of the domain, checklist result …). */
function methodValues(method: RiskMethod, domain: string, h: Pick<HazardInput, "likelihood" | "severity" | "factors" | "checklistResult">): HazardValues & { checklistResult: ChecklistResultKey | null } {
  if (method === "FMEA") {
    const keys = new Set(FMEA_FACTORS[domain === "ENVIRONMENT" ? "ENVIRONMENT" : "HEALTH_SAFETY"].map((f) => f.key));
    const factors = Object.fromEntries(Object.entries(h.factors ?? {}).filter(([k]) => keys.has(k)));
    return { likelihood: null, severity: null, factors, checklistResult: null };
  }
  if (method === "CHECKLIST") {
    const result = (CHECKLIST_RESULTS as readonly string[]).includes(h.checklistResult ?? "") ? (h.checklistResult as ChecklistResultKey) : null;
    return { likelihood: null, severity: null, factors: null, checklistResult: result };
  }
  return { likelihood: h.likelihood ?? null, severity: h.severity ?? null, factors: null, checklistResult: null };
}

function prepareHazards(method: RiskMethod, domain: string, input: readonly HazardInput[], existingIds: readonly string[]): PreparedHazard[] {
  return input.map((h) => {
    if (h.id && !existingIds.includes(h.id)) throw new ValidationError(`Unknown ${hazardWordTitle(domain).toLowerCase()} – reload the assessment.`);
    const values = methodValues(method, domain, h);
    return {
      id: h.id ?? null,
      activity: h.activity,
      name: h.name,
      consequence: h.consequence,
      controls: h.controls,
      recommendation: h.recommendation,
      justification: h.justification,
      likelihood: values.likelihood ?? null,
      severity: values.severity ?? null,
      factors: values.factors && Object.keys(values.factors).length ? values.factors : null,
      checklistResult: values.checklistResult,
      score: scoreHazard(method, domain, values),
    };
  });
}

export function hazardSnapshot(rows: readonly { id: string; activity: string; name: string; consequence: string; controls: string; recommendation: string | null; justification: string; likelihood: number | null; severity: number | null; factors: unknown; checklistResult: string | null; score: number | null }[]): HazardSnapshot[] {
  return rows.map((h) => ({
    id: h.id,
    activity: h.activity,
    name: h.name,
    consequence: h.consequence,
    controls: h.controls,
    recommendation: h.recommendation,
    justification: h.justification,
    likelihood: h.likelihood,
    severity: h.severity,
    factors: (h.factors as Record<string, number> | null) ?? null,
    checklistResult: (h.checklistResult as ChecklistResultKey | null) ?? null,
    score: h.score,
  }));
}

/** Writes the hazard list: updates kept ids, creates new ones, removes the rest (blocked while tasks point at them). */
async function persistHazards(tx: DbClient, organizationId: string, assessmentId: string, hazards: readonly PreparedHazard[], existing: readonly { id: string; name: string }[], domain: string): Promise<void> {
  const kept = new Set(hazards.map((h) => h.id).filter((v): v is string => Boolean(v)));
  const removed = existing.filter((h) => !kept.has(h.id));
  if (removed.length) {
    const linked = await tx.riskTask.findMany({ where: { hazardId: { in: removed.map((h) => h.id) } }, select: { hazardId: true } });
    if (linked.length) {
      const names = removed.filter((h) => linked.some((l) => l.hazardId === h.id)).map((h) => `“${h.name || "Untitled"}”`);
      blocked("Cannot remove a hazard with tasks", [`${hazardWordTitle(domain)} ${names.join(", ")} has linked tasks – keep it, or complete its tasks under another ${hazardWordTitle(domain).toLowerCase()}.`]);
    }
    await tx.riskHazard.deleteMany({ where: { id: { in: removed.map((h) => h.id) } } });
  }
  for (const [i, h] of hazards.entries()) {
    const data = {
      sortOrder: i,
      activity: h.activity,
      name: h.name,
      consequence: h.consequence,
      controls: h.controls,
      recommendation: h.recommendation,
      justification: h.justification,
      likelihood: h.likelihood,
      severity: h.severity,
      factors: h.factors ? json(h.factors) : Prisma.DbNull,
      checklistResult: h.checklistResult,
      score: h.score,
    };
    if (h.id) await tx.riskHazard.update({ where: { id: h.id }, data });
    else await tx.riskHazard.create({ data: { ...data, organizationId, assessmentId } });
  }
}

// ── Preparation (validation before the write transaction) ───────────────────

type ContentInput = Omit<AssessmentUpdateInput, "expectedVersion" | "decision">;

interface Prepared {
  placement: ResolvedPlacement;
  snapshot: QuestionnaireSnapshot;
  rules: RiskFormSettings;
  method: RiskMethod;
  domain: string;
  answers: FormValues;
  hazards: PreparedHazard[];
  score: number | null;
  band: RiskBand | null;
  facts: AssessmentFacts;
  itemType: string | null;
  operationMode: string | null;
  workArea: string | null;
}

async function placementLabel(db: DbClient, p: ResolvedPlacement): Promise<{ label: string; siteName: string | null }> {
  const [site, location, department] = await Promise.all([
    p.siteId ? db.site.findUnique({ where: { id: p.siteId }, select: { name: true } }) : null,
    p.locationId ? db.location.findUnique({ where: { id: p.locationId }, select: { name: true } }) : null,
    p.departmentId ? db.department.findUnique({ where: { id: p.departmentId }, select: { name: true } }) : null,
  ]);
  return { label: [site?.name, location?.name, department?.name].filter(Boolean).join(" · "), siteName: site?.name ?? null };
}

async function prepare(
  db: DbClient,
  input: ContentInput,
  ctx: { versionId: string | null; existing: Pick<AssessmentRow, "form" | "itemType" | "operationMode" | "workArea" | "hazards"> | null },
): Promise<Prepared> {
  const placement = await resolvePlacement({ departmentId: input.departmentId }, db);
  let departmentValid = false;
  if (placement.departmentId) {
    const dept = await db.department.findUnique({ where: { id: placement.departmentId }, select: { isActive: true } });
    departmentValid = Boolean(dept?.isActive);
  }

  // Captured questionnaire: kept for the life of the assessment; re-filtered (same version) when the site changes.
  let snapshot = ctx.existing ? asSnapshot(ctx.existing.form) : null;
  if (!snapshot || snapshot.siteId !== placement.siteId) {
    const versionId = snapshot?.versionId ?? ctx.versionId;
    if (!versionId) throw new ValidationError("Choose a published Risk form.");
    const fresh = await captureRiskForm(db, versionId, placement.siteId);
    // A re-filter keeps the originally captured settings (rules never change after capture).
    snapshot = snapshot ? { ...fresh, settings: snapshot.settings, capturedAt: snapshot.capturedAt } : fresh;
  }
  const rules = rulesOf(snapshot);
  const method = rules.method;
  const domain = rules.domain;

  await assertActiveUsers(db, [input.ownerId], "the responsible person");
  await assertActiveUsers(db, [input.approverId], "the approver");
  await assertActiveUsers(db, input.participantIds, "participants");

  const [itemType, operationMode, workArea] = await Promise.all([
    listLabel(db, "risk.activity-type", input.itemType, ctx.existing?.itemType, "activity / item type"),
    listLabel(db, "risk.operation-mode", input.operationMode, ctx.existing?.operationMode, "operation mode"),
    listLabel(db, "risk.work-area", input.workArea, ctx.existing?.workArea, "work area"),
  ]);

  // Hazard names come from the form's hazard list when it has one (names already saved stay valid).
  const formId = await formIdOfVersion(db, snapshot.versionId);
  const named = checkHazardNames(
    input.hazards.map((h) => ({ id: h.id ?? null, name: h.name })),
    new Map(ctx.existing?.hazards.map((h) => [h.id, h.name]) ?? []),
    formId ? await hazardOptionsOf(db, formId) : [],
    hazardWordTitle(domain).toLowerCase(),
  );
  if (named.problems.length) throw new ValidationError(named.problems.join(" "));
  const hazards = prepareHazards(
    method,
    domain,
    input.hazards.map((h, i) => ({ ...h, name: named.names[i]! })),
    ctx.existing?.hazards.map((h) => h.id) ?? [],
  );
  const { score } = scoreAssessment(method, domain, hazards);
  const band = classify(score, rules);
  const top = hazards.filter((h) => h.score !== null && h.score === score).map((h) => matrixCell(method, h)).find(Boolean) ?? null;

  const where = await placementLabel(db, placement);
  const composed = composeAnswers(snapshot, asAnswers(input.answers), {
    title: input.title,
    hazards: hazards.map((h) => h.name),
    site: where.label,
    ownerId: input.ownerId,
    reviewDate: input.reviewDate,
    likelihood: top?.likelihood ?? null,
    severity: top?.severity ?? null,
  });
  const check = checkRiskAnswers(snapshot, composed);

  return {
    placement,
    snapshot,
    rules,
    method,
    domain,
    answers: check.data,
    hazards,
    score,
    band,
    itemType,
    operationMode,
    workArea,
    facts: {
      title: input.title,
      description: input.description,
      departmentId: placement.departmentId,
      departmentValid,
      ownerId: input.ownerId,
      approverId: input.approverId,
      reviewDate: input.reviewDate,
      method,
      domain,
      hazards,
      missingAnswers: [...check.missing, ...check.problems],
      formAvailable: formAvailableAtSite(rules as unknown as Record<string, unknown>, placement.siteId),
      siteName: where.siteName,
    },
  };
}

function inputFromRow(row: AssessmentRow): ContentInput {
  return {
    title: row.title,
    description: row.description,
    departmentId: row.departmentId,
    ownerId: row.ownerId,
    approverId: row.approverId,
    reviewDate: dateOnly(row.reviewDate),
    participantIds: row.participantIds,
    itemType: row.itemType,
    itemIdentity: row.itemIdentity,
    operationMode: row.operationMode,
    workArea: row.workArea,
    peopleExposed: row.peopleExposed,
    impactContext: row.impactContext,
    isConfidential: row.isConfidential,
    hazards: row.hazards.map((h) => ({
      id: h.id,
      activity: h.activity,
      name: h.name,
      consequence: h.consequence,
      controls: h.controls,
      recommendation: h.recommendation,
      justification: h.justification,
      likelihood: h.likelihood,
      severity: h.severity,
      factors: (h.factors as Record<string, number> | null) ?? null,
      checklistResult: (h.checklistResult as ChecklistResultKey | null) ?? null,
    })),
    answers: asAnswers(row.answers),
  };
}

/** Consumes uploads referenced by `file` answers as evidence on the assessment; answers keep the attachment ids. */
async function attachFileAnswers(tx: DbClient, user: CurrentUser, assessmentId: string, snapshot: QuestionnaireSnapshot, answers: FormValues): Promise<FormValues> {
  const pending = pendingUploads(snapshot, answers);
  if (!pending.length) return answers;
  const out: FormValues = { ...answers };
  for (const item of pending) {
    const file = await uploadService.consume(item.uploadId, user, "evidence", tx);
    const row = await tx.attachment.create({
      data: {
        organizationId: user.organizationId,
        entityType: ASSESSMENT_ENTITY,
        entityId: assessmentId,
        kind: "FILE",
        name: file.fileName,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageDriver: file.storageDriver,
        storageKey: file.storageKey,
        uploadedById: user.id,
      },
    });
    out[item.fieldKey] = (out[item.fieldKey] as { uploadId?: string; attachmentId?: string; fileName: string; sizeBytes?: number }[]).map((f) =>
      f.uploadId === item.uploadId ? { attachmentId: row.id, fileName: f.fileName, sizeBytes: f.sizeBytes } : f,
    );
  }
  return out;
}

/** Approval inside the caller's transaction: revision + 1 and a retained score + hazard snapshot. */
async function approveInTx(tx: DbClient, id: string, user: CurrentUser, meta: RequestMeta, opts: { currentRevision: number; comment: string | null; method: string; rules: unknown }): Promise<number> {
  const hazards = await tx.riskHazard.findMany({ where: { assessmentId: id }, orderBy: { sortOrder: "asc" } });
  const rules = readRules(opts.rules, opts.method);
  const { score } = scoreAssessment(rules.method, rules.domain, hazards.map((h) => ({ ...h, factors: h.factors as Record<string, number> | null })));
  const band = classify(score, rules);
  const revision = nextRevision(opts.currentRevision);
  const today = todayFor(user.timeZone);
  await tx.riskRevision.create({
    data: {
      organizationId: user.organizationId,
      assessmentId: id,
      revision,
      date: toDate(today),
      action: "APPROVED",
      comment: opts.comment,
      score,
      band,
      hazards: json(hazardSnapshot(hazards)),
      actorId: user.id,
      actorName: user.name,
    },
  });
  await tx.riskAssessment.update({
    where: { id },
    data: { status: "APPROVED", revision, approvedAt: new Date(), approvedById: user.id, currentScore: score, band },
  });
  await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: id, action: RISK_AUDIT.APPROVED, actor: user, changes: { revision, score, band }, metadata: opts.comment ? { comment: opts.comment } : undefined, meta }, tx);
  return revision;
}

async function notify(db: DbClient, actor: CurrentUser, userIds: (string | null)[], input: { type: string; title: string; body: string; id: string; dedupe: string }) {
  const recipients = userIds.filter((u): u is string => Boolean(u) && u !== actor.id);
  if (!recipients.length) return;
  await notificationService.notify({ userIds: recipients, type: input.type, title: input.title, body: input.body, link: assessmentHref(input.id), entityType: ASSESSMENT_ENTITY, entityId: input.id, dedupeKey: input.dedupe }, db);
}

function gatesFor(decision: AssessmentDecision, targetStatus: RiskAssessmentStatus, facts: AssessmentFacts): string[] {
  return decision === "draft" && targetStatus === "DRAFT" ? draftBlockers(facts) : submitBlockers(facts);
}

const GATE_MESSAGE: Record<AssessmentDecision, string> = {
  draft: "The draft cannot be saved yet",
  submit: "The assessment cannot be submitted yet",
  approve: "The assessment cannot be approved yet",
};

export const assessmentService = {
  /** New assessment from a published Risk form (draft, submit or save & approve). Idempotent on clientId. */
  async create(input: AssessmentCreateInput, user: CurrentUser, meta: RequestMeta): Promise<AssessmentWriteResult> {
    if (input.clientId) {
      const existing = await prisma.riskAssessment.findUnique({ where: { clientId: input.clientId }, select: { id: true, reference: true, status: true, revision: true, createdById: true } });
      if (existing) {
        if (existing.createdById !== user.id) throw new ValidationError("This assessment id is already in use.");
        return { id: existing.id, reference: existing.reference, status: existing.status, revision: existing.revision, created: false };
      }
    }
    const prepared = await prepare(prisma, input, { versionId: input.formVersionId, existing: null });
    if (!canCreateAssessmentAt(user, prepared.placement)) throw new ForbiddenError("You cannot create assessments for this department.");
    const target: RiskAssessmentStatus = input.decision === "submit" ? "AWAITING_APPROVAL" : "DRAFT";
    const gates = gatesFor(input.decision, target, prepared.facts);
    if (gates.length) blocked(GATE_MESSAGE[input.decision], gates);
    const probe: AssessmentRecordFacts = { ...prepared.placement, ownerId: input.ownerId, approverId: input.approverId, createdById: user.id, status: "DRAFT" };
    if (input.decision === "approve" && !canApproveAssessment(user, probe)) throw new ForbiddenError("You cannot approve assessments for this department – submit it for approval instead.");

    const organizationId = requireTenantId();
    return prisma.$transaction(async (tx) => {
      const reference = await numberingService.next(tx, "risk-assessment");
      const row = await tx.riskAssessment.create({
        data: {
          organizationId,
          reference,
          labelId: newLabelId(),
          clientId: input.clientId ?? null,
          title: input.title.trim(),
          description: input.description,
          ...prepared.placement,
          ownerId: input.ownerId,
          approverId: input.approverId,
          reviewDate: input.reviewDate ? toDate(input.reviewDate) : null,
          participantIds: [...new Set(input.participantIds)],
          itemType: prepared.itemType,
          itemIdentity: input.itemIdentity,
          operationMode: prepared.operationMode,
          workArea: prepared.workArea,
          peopleExposed: input.peopleExposed,
          impactContext: input.impactContext,
          status: target,
          form: json(prepared.snapshot),
          formVersionId: prepared.snapshot.versionId,
          method: prepared.method,
          domain: prepared.domain,
          rules: json(prepared.rules),
          answers: {},
          currentScore: prepared.score,
          band: prepared.band,
          isConfidential: seesConfidentialFlag(user) ? Boolean(input.isConfidential) : false,
          submittedAt: target === "AWAITING_APPROVAL" ? new Date() : null,
          createdById: user.id,
        },
        select: { id: true },
      });
      await persistHazards(tx, organizationId, row.id, prepared.hazards, [], prepared.domain);
      const answers = await attachFileAnswers(tx, user, row.id, prepared.snapshot, prepared.answers);
      await tx.riskAssessment.update({ where: { id: row.id }, data: { answers: json(answers) } });
      await recordAudit(
        {
          entityType: ASSESSMENT_ENTITY,
          entityId: row.id,
          action: target === "AWAITING_APPROVAL" ? RISK_AUDIT.SUBMITTED : RISK_AUDIT.DRAFT_SAVED,
          actor: user,
          changes: { reference, title: input.title.trim(), score: prepared.score, band: prepared.band },
          metadata: { formName: prepared.snapshot.name, formVersion: prepared.snapshot.version, method: prepared.method },
          meta,
        },
        tx,
      );
      let status: AssessmentStatus = target;
      let revision = 0;
      if (input.decision === "approve") {
        revision = await approveInTx(tx, row.id, user, meta, { currentRevision: 0, comment: null, method: prepared.method, rules: prepared.rules });
        status = "APPROVED";
      } else if (target === "AWAITING_APPROVAL") {
        await notify(tx, user, [input.approverId], { type: "risk.approval_requested", title: `${reference} – approval requested`, body: input.title.trim(), id: row.id, dedupe: `risk.approval:${row.id}:0` });
      }
      return { id: row.id, reference, status, revision, created: true };
    });
  },

  /** Edit a Draft / Awaiting-approval assessment (an Approved one needs "Start revision" first). */
  async update(id: string, input: AssessmentUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<AssessmentWriteResult> {
    const row = await loadVisibleAssessment(prisma, user, id);
    const statusGate = commandBlockers(row.status, "save");
    if (statusGate.length) blocked("This assessment cannot be changed now", statusGate);
    if (!canEditAssessment(user, assessmentFacts(row))) throw new ForbiddenError();
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const prepared = await prepare(prisma, input, { versionId: null, existing: row });
    const probe: AssessmentRecordFacts = { ...prepared.placement, ownerId: input.ownerId, approverId: input.approverId, createdById: row.createdById, status: row.status };
    if (prepared.placement.departmentId !== row.departmentId && prepared.placement.departmentId && !canCreateAssessmentAt(user, prepared.placement) && !canEditAssessment(user, probe)) {
      throw new ForbiddenError("You cannot move assessments to this department.");
    }
    const target: RiskAssessmentStatus = input.decision === "submit" ? "AWAITING_APPROVAL" : row.status;
    const gates = gatesFor(input.decision, target, prepared.facts);
    if (gates.length) blocked(row.status === "AWAITING_APPROVAL" && input.decision === "draft" ? "An assessment awaiting approval must stay complete" : GATE_MESSAGE[input.decision], gates);
    if (input.decision === "approve" && !canApproveAssessment(user, probe)) throw new ForbiddenError("You cannot approve this assessment – submit it for approval instead.");

    const organizationId = requireTenantId();
    return prisma.$transaction(async (tx) => {
      const answers = await attachFileAnswers(tx, user, id, prepared.snapshot, prepared.answers);
      const data = {
        title: input.title.trim(),
        description: input.description,
        ...prepared.placement,
        ownerId: input.ownerId,
        approverId: input.approverId,
        reviewDate: input.reviewDate ? toDate(input.reviewDate) : null,
        participantIds: [...new Set(input.participantIds)],
        itemType: prepared.itemType,
        itemIdentity: input.itemIdentity,
        operationMode: prepared.operationMode,
        workArea: prepared.workArea,
        peopleExposed: input.peopleExposed,
        impactContext: input.impactContext,
        isConfidential: seesConfidentialFlag(user) && input.isConfidential !== undefined ? input.isConfidential : row.isConfidential,
      };
      const updated = await tx.riskAssessment.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          ...data,
          status: target,
          ...(target === "AWAITING_APPROVAL" && row.status === "DRAFT" ? { submittedAt: new Date() } : {}),
          form: json(prepared.snapshot),
          answers: json(answers),
          currentScore: prepared.score,
          band: prepared.band,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await persistHazards(tx, organizationId, id, prepared.hazards, row.hazards, prepared.domain);
      const changes = diff(
        { ...row, reviewDate: dateOnly(row.reviewDate) } as unknown as Record<string, unknown>,
        { ...data, reviewDate: input.reviewDate } as Record<string, unknown>,
        ["title", "description", "departmentId", "ownerId", "approverId", "reviewDate", "itemType", "itemIdentity", "operationMode", "workArea", "peopleExposed", "impactContext", "isConfidential"],
      );
      await recordAudit(
        {
          entityType: ASSESSMENT_ENTITY,
          entityId: id,
          action: RISK_AUDIT.UPDATED,
          actor: user,
          changes: { ...(changes ?? {}), ...(row.currentScore !== prepared.score ? { score: { from: row.currentScore, to: prepared.score } } : {}), hazards: prepared.hazards.length },
          meta,
        },
        tx,
      );
      if (target === "AWAITING_APPROVAL" && row.status === "DRAFT") {
        await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: id, action: RISK_AUDIT.SUBMITTED, actor: user, meta }, tx);
        await notify(tx, user, [input.approverId], { type: "risk.approval_requested", title: `${row.reference} – approval requested`, body: input.title.trim(), id, dedupe: `risk.approval:${id}:${row.revision}` });
      }
      let status: AssessmentStatus = target;
      let revision = row.revision;
      if (input.decision === "approve") {
        revision = await approveInTx(tx, id, user, meta, { currentRevision: row.revision, comment: null, method: row.method, rules: row.rules });
        status = "APPROVED";
        await notify(tx, user, [input.ownerId], { type: "risk.approved", title: `${row.reference} approved (revision ${revision})`, body: input.title.trim(), id, dedupe: `risk.approved:${id}:${revision}` });
      }
      return { id, reference: row.reference, status, revision, created: false };
    });
  },

  /** Submit a saved Draft for approval (all submission gates). */
  async submit(id: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<AssessmentWriteResult> {
    const row = await loadVisibleAssessment(prisma, user, id);
    const gate = commandBlockers(row.status, "submit");
    if (gate.length) blocked("The assessment cannot be submitted", gate);
    if (!canEditAssessment(user, assessmentFacts(row))) throw new ForbiddenError();
    if (row.version !== expectedVersion) throw new StaleVersionError();
    const prepared = await prepare(prisma, inputFromRow(row), { versionId: null, existing: row });
    const gates = submitBlockers(prepared.facts);
    if (gates.length) blocked(GATE_MESSAGE.submit, gates);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.riskAssessment.updateMany({
        where: { id, version: expectedVersion, status: "DRAFT" },
        data: { status: "AWAITING_APPROVAL", submittedAt: new Date(), answers: json(prepared.answers), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: id, action: RISK_AUDIT.SUBMITTED, actor: user, meta }, tx);
      await notify(tx, user, [row.approverId], { type: "risk.approval_requested", title: `${row.reference} – approval requested`, body: row.title, id, dedupe: `risk.approval:${id}:${row.revision}` });
      return { id, reference: row.reference, status: "AWAITING_APPROVAL" as const, revision: row.revision, created: false };
    });
  },

  /** Approve (from Awaiting approval, or a complete Draft): revision + 1 with a retained snapshot. Owner unchanged. */
  async approve(id: string, input: { expectedVersion: number; comment?: string | null }, user: CurrentUser, meta: RequestMeta): Promise<AssessmentWriteResult> {
    const row = await loadVisibleAssessment(prisma, user, id);
    const gate = commandBlockers(row.status, "approve");
    if (gate.length) blocked("The assessment cannot be approved", gate);
    if (!canApproveAssessment(user, assessmentFacts(row))) throw new ForbiddenError();
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const prepared = await prepare(prisma, inputFromRow(row), { versionId: null, existing: row });
    const gates = submitBlockers(prepared.facts);
    if (gates.length) blocked(GATE_MESSAGE.approve, gates);
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.riskAssessment.updateMany({ where: { id, version: input.expectedVersion }, data: { version: { increment: 1 } } });
      if (claimed.count !== 1) throw new StaleVersionError();
      const revision = await approveInTx(tx, id, user, meta, { currentRevision: row.revision, comment: input.comment?.trim() || null, method: row.method, rules: row.rules });
      await notify(tx, user, [row.ownerId], { type: "risk.approved", title: `${row.reference} approved (revision ${revision})`, body: row.title, id, dedupe: `risk.approved:${id}:${revision}` });
      return { id, reference: row.reference, status: "APPROVED" as const, revision, created: false };
    });
  },

  /** Editing an Approved assessment starts a Draft revision; the earlier approval stays in the history. */
  async startRevision(id: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<AssessmentWriteResult> {
    const row = await loadVisibleAssessment(prisma, user, id);
    const gate = commandBlockers(row.status, "revise");
    if (gate.length) blocked("A revision cannot be started", gate);
    if (!canEditAssessment(user, assessmentFacts(row))) throw new ForbiddenError();
    return prisma.$transaction(async (tx) => {
      const updated = await tx.riskAssessment.updateMany({ where: { id, version: expectedVersion, status: "APPROVED" }, data: { status: "DRAFT", version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: id, action: RISK_AUDIT.REVISION_STARTED, actor: user, changes: { approvedRevision: row.revision }, meta }, tx);
      return { id, reference: row.reference, status: "DRAFT" as const, revision: row.revision, created: false };
    });
  },

  async archive(id: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAssessment(prisma, user, id);
    const gate = commandBlockers(row.status, "archive");
    if (gate.length) blocked("The assessment cannot be archived", gate);
    if (!canArchiveAssessment(user, assessmentFacts(row))) throw new ForbiddenError();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.riskAssessment.updateMany({ where: { id, version: expectedVersion }, data: { status: "ARCHIVED", archivedAt: new Date(), version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: id, action: RISK_AUDIT.ARCHIVED, actor: user, changes: { previousStatus: row.status }, meta }, tx);
    });
  },

  /** Restore an archived assessment as Draft (never silently Approved). */
  async restore(id: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAssessment(prisma, user, id);
    const gate = commandBlockers(row.status, "restore");
    if (gate.length) blocked("The assessment cannot be restored", gate);
    if (!canArchiveAssessment(user, assessmentFacts(row))) throw new ForbiddenError();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.riskAssessment.updateMany({ where: { id, version: expectedVersion }, data: { status: restoredStatus(), archivedAt: null, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: id, action: RISK_AUDIT.RESTORED, actor: user, changes: { status: "DRAFT" }, meta }, tx);
    });
  },

  /** A separate Draft with copied content; revision, history, reviews and attachments are cleared. */
  async clone(id: string, user: CurrentUser, meta: RequestMeta): Promise<AssessmentWriteResult> {
    const row = await loadVisibleAssessment(prisma, user, id);
    if (!canCreateAssessmentAt(user, assessmentFacts(row))) throw new ForbiddenError();
    const snapshot = asSnapshot(row.form);
    const fileKeys = new Set((snapshot?.fields ?? []).filter((f) => f.type === "file").map((f) => f.key));
    const answers = Object.fromEntries(Object.entries(asAnswers(row.answers)).filter(([k]) => !fileKeys.has(k)));
    const organizationId = requireTenantId();
    return prisma.$transaction(async (tx) => {
      const reference = await numberingService.next(tx, "risk-assessment");
      const title = `${row.title} (copy)`.slice(0, 200);
      const copy = await tx.riskAssessment.create({
        data: {
          organizationId,
          reference,
          labelId: newLabelId(),
          title,
          description: row.description,
          businessUnitId: row.businessUnitId,
          siteId: row.siteId,
          locationId: row.locationId,
          departmentId: row.departmentId,
          ownerId: row.ownerId,
          approverId: row.approverId,
          reviewDate: row.reviewDate,
          participantIds: row.participantIds,
          itemType: row.itemType,
          itemIdentity: row.itemIdentity,
          operationMode: row.operationMode,
          workArea: row.workArea,
          peopleExposed: row.peopleExposed,
          impactContext: row.impactContext,
          status: "DRAFT",
          revision: 0,
          form: json(row.form),
          formVersionId: row.formVersionId,
          method: row.method,
          domain: row.domain,
          rules: json(row.rules),
          answers: json(answers),
          currentScore: row.currentScore,
          band: row.band,
          isConfidential: row.isConfidential,
          clonedFromId: row.id,
          createdById: user.id,
        },
        select: { id: true },
      });
      if (row.hazards.length) {
        await tx.riskHazard.createMany({
          data: row.hazards.map((h, i) => ({
            organizationId,
            assessmentId: copy.id,
            sortOrder: i,
            activity: h.activity,
            name: h.name,
            consequence: h.consequence,
            controls: h.controls,
            recommendation: h.recommendation,
            justification: h.justification,
            likelihood: h.likelihood,
            severity: h.severity,
            factors: h.factors === null ? undefined : json(h.factors),
            checklistResult: h.checklistResult,
            score: h.score,
          })),
        });
      }
      await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: copy.id, action: RISK_AUDIT.CLONED, actor: user, changes: { reference, clonedFrom: row.reference }, meta }, tx);
      await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: row.id, action: RISK_AUDIT.CLONED, actor: user, changes: { clone: reference }, meta }, tx);
      return { id: copy.id, reference, status: "DRAFT" as const, revision: 0, created: true };
    });
  },

  /** Periodic review (Approved only): records the review and moves the review date – score and revision unchanged. */
  async review(id: string, input: PeriodicReviewInput, user: CurrentUser, meta: RequestMeta): Promise<{ nextReviewDate: string }> {
    const row = await loadVisibleAssessment(prisma, user, id);
    if (!canReviewAssessment(user, assessmentFacts(row))) throw new ForbiddenError();
    const today = todayFor(user.timeZone);
    const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
    const blockers = reviewBlockers({
      status: row.status,
      reviewDate: valid(input.reviewDate) ? input.reviewDate : null,
      nextReviewDate: valid(input.nextReviewDate) ? input.nextReviewDate : null,
      comment: input.comment,
      today,
    });
    if (blockers.length) blocked("The periodic review cannot be saved", blockers);
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.riskAssessment.updateMany({
        where: { id, version: input.expectedVersion, status: "APPROVED" },
        data: { reviewDate: toDate(input.nextReviewDate), lastReviewedAt: toDate(input.reviewDate), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await tx.riskReview.create({
        data: {
          organizationId: user.organizationId,
          assessmentId: id,
          reviewDate: toDate(input.reviewDate),
          comment: input.comment.trim(),
          nextReviewDate: toDate(input.nextReviewDate),
          reviewerId: user.id,
          reviewerName: user.name,
          revision: row.revision,
          score: row.currentScore,
        },
      });
      await recordAudit(
        {
          entityType: ASSESSMENT_ENTITY,
          entityId: id,
          action: RISK_AUDIT.REVIEWED,
          actor: user,
          changes: { reviewDate: { from: dateOnly(row.reviewDate), to: input.nextReviewDate }, reviewedOn: input.reviewDate },
          metadata: { comment: input.comment.trim(), revision: row.revision, score: row.currentScore },
          meta,
        },
        tx,
      );
    });
    return { nextReviewDate: input.nextReviewDate };
  },

  /** Related-assessment link (same site; both visible). Stored as a RecordLink in both directions' lookup. */
  async link(id: string, otherId: string, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAssessment(prisma, user, id);
    const other = await loadVisibleAssessment(prisma, user, otherId);
    if (!canEditAssessment(user, { ...assessmentFacts(row), status: "DRAFT" }) && row.ownerId !== user.id) throw new ForbiddenError();
    const blockers = relatedLinkBlockers(row, other);
    if (blockers.length) blocked("The assessments cannot be related", blockers);
    const existing = await prisma.recordLink.findFirst({
      where: {
        kind: RELATED_KIND,
        OR: [
          { sourceType: ASSESSMENT_ENTITY, sourceId: id, targetType: ASSESSMENT_ENTITY, targetId: otherId },
          { sourceType: ASSESSMENT_ENTITY, sourceId: otherId, targetType: ASSESSMENT_ENTITY, targetId: id },
        ],
      },
      select: { id: true },
    });
    if (existing) return;
    await prisma.$transaction(async (tx) => {
      const { created } = await recordLinkService.ensure(tx, { sourceType: ASSESSMENT_ENTITY, sourceId: id, sourceKey: otherId, kind: RELATED_KIND }, async () => ({ targetType: ASSESSMENT_ENTITY, targetId: otherId }), user.id);
      if (created) await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: id, action: RISK_AUDIT.RELATED_LINKED, actor: user, changes: { related: other.reference }, meta }, tx);
    });
  },

  async unlink(id: string, otherId: string, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAssessment(prisma, user, id);
    if (!canEditAssessment(user, { ...assessmentFacts(row), status: "DRAFT" }) && row.ownerId !== user.id) throw new ForbiddenError();
    await prisma.$transaction(async (tx) => {
      const removed = await tx.recordLink.deleteMany({
        where: {
          kind: RELATED_KIND,
          OR: [
            { sourceType: ASSESSMENT_ENTITY, sourceId: id, targetType: ASSESSMENT_ENTITY, targetId: otherId },
            { sourceType: ASSESSMENT_ENTITY, sourceId: otherId, targetType: ASSESSMENT_ENTITY, targetId: id },
          ],
        },
      });
      if (removed.count) await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: id, action: RISK_AUDIT.RELATED_UNLINKED, actor: user, changes: { relatedId: otherId }, meta }, tx);
    });
  },
};
