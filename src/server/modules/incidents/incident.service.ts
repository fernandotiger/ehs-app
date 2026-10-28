import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatAnswer, pendingUploads, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import { addDays } from "@/lib/incidents";
import type { IncidentCreateInput, IncidentUpdateInput, PersonInput } from "@/lib/validation/incidents";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ForbiddenError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { numberingService } from "@/server/modules/numbering/numbering.service";
import { resolvePlacement, type ResolvedPlacement } from "@/server/modules/organisation/placement";
import { uploadService } from "@/server/modules/uploads/upload.service";
import { requireTenantId } from "@/server/tenancy/context";
import { asAnswers, asSnapshot, captureIncidentForm, checkAnswers, publishedVersionId, REPORT_SYSTEM_KEYS } from "./forms";
import { anonymousClientId, anonymousReporterKey, ANONYMOUS_REPORTER } from "./anonymous-reporter";
import {
  actsAsAnonymousReporter,
  canArchiveIncident,
  canCloseIncident,
  canEditReport,
  canSubmitReport,
  incidentVisibleWhere,
  isReporter,
  type IncidentPrincipal,
  type IncidentRecordFacts,
} from "./incident-access.policy";
import { listLabel } from "./incident-lookups";
import { factsOf, incidentHref, INCIDENT_ENTITY, refreshIncidentStatus, toDate } from "./support";
import { closureBlockers, deriveIncidentStatus, draftBlockers, submitBlockers, type ReportFacts } from "./workflow";

/** Report lifecycle: draft → submit, edit, archive/restore, explicit close/reopen. */

export const INCIDENT_AUDIT = {
  DRAFT_SAVED: "INCIDENT_DRAFT_SAVED",
  REPORTED: "INCIDENT_REPORTED",
  SUBMITTED: "INCIDENT_SUBMITTED",
  UPDATED: "INCIDENT_UPDATED",
  ARCHIVED: "INCIDENT_ARCHIVED",
  RESTORED: "INCIDENT_RESTORED",
  CLOSED: "INCIDENT_CLOSED",
  REOPENED: "INCIDENT_REOPENED",
} as const;

export interface IncidentWriteResult {
  id: string;
  reference: string;
  isDraft: boolean;
  /** false when an earlier request with the same clientId already created it. */
  created: boolean;
}

const recordSelect = {
  id: true,
  reference: true,
  version: true,
  typeId: true,
  subtypeId: true,
  title: true,
  narrative: true,
  severity: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
  preciseLocation: true,
  shift: true,
  occurredAt: true,
  investigationTargetDate: true,
  isConfidential: true,
  isDraft: true,
  reporterId: true,
  isAnonymous: true,
  anonymousReporterKey: true,
  immediateAction: true,
  firstAid: true,
  nurseNotified: true,
  notifyUserIds: true,
  reportForm: true,
  answers: true,
  closedAt: true,
  closureNote: true,
  archivedAt: true,
  investigators: { select: { userId: true } },
} satisfies Prisma.IncidentSelect;

type RecordRow = Prisma.IncidentGetPayload<{ select: typeof recordSelect }>;

export function recordFacts(
  row: Pick<RecordRow, "businessUnitId" | "siteId" | "locationId" | "departmentId" | "reporterId" | "isAnonymous" | "anonymousReporterKey" | "isDraft" | "isConfidential" | "closedAt" | "archivedAt"> & {
    investigators: { userId: string }[];
  },
): IncidentRecordFacts {
  return {
    businessUnitId: row.businessUnitId,
    siteId: row.siteId,
    locationId: row.locationId,
    departmentId: row.departmentId,
    reporterId: row.reporterId,
    isAnonymous: row.isAnonymous,
    anonymousReporterKey: row.anonymousReporterKey,
    investigatorIds: row.investigators.map((i) => i.userId),
    isDraft: row.isDraft,
    isConfidential: row.isConfidential,
    closed: Boolean(row.closedAt),
    archived: Boolean(row.archivedAt),
  };
}

/** Loads an incident the user may see (404 otherwise). */
export async function loadVisibleIncident(db: DbClient, user: CurrentUser, id: string): Promise<RecordRow> {
  const row = await db.incident.findFirst({ where: { AND: [{ id }, incidentVisibleWhere(user)] }, select: recordSelect });
  if (!row) throw new NotFoundError();
  return row;
}

async function assertUsers(db: DbClient, ids: readonly string[], what: string): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const found = await db.user.count({ where: { id: { in: unique }, isActive: true } });
  if (found !== unique.length) throw new ValidationError(`Choose active people from the directory for ${what}.`);
}

async function placementLabel(db: DbClient, p: ResolvedPlacement): Promise<string> {
  const [site, location, department] = await Promise.all([
    p.siteId ? db.site.findUnique({ where: { id: p.siteId }, select: { name: true } }) : null,
    p.locationId ? db.location.findUnique({ where: { id: p.locationId }, select: { name: true } }) : null,
    p.departmentId ? db.department.findUnique({ where: { id: p.departmentId }, select: { name: true } }) : null,
  ]);
  return [site?.name, location?.name, department?.name].filter(Boolean).join(" · ");
}

/** Mandatory Report questions come from the workflow's own controls (never typed twice). */
function composeAnswers(snapshot: QuestionnaireSnapshot, custom: FormValues, values: { title: string; occurredAt: string | null; narrative: string | null; site: string }): FormValues {
  const keys = new Set(snapshot.fields.map((f) => f.key));
  const out: FormValues = { ...custom };
  const set = (key: string, value: string | null) => {
    if (!keys.has(key)) return;
    if (value) out[key] = value;
    else delete out[key];
  };
  set(REPORT_SYSTEM_KEYS.title, values.title || null);
  set(REPORT_SYSTEM_KEYS.occurredAt, values.occurredAt);
  set(REPORT_SYSTEM_KEYS.site, values.site || null);
  set(REPORT_SYSTEM_KEYS.narrative, values.narrative);
  return out;
}

function searchTextFor(title: string, reference: string, snapshot: QuestionnaireSnapshot | null, answers: FormValues): string {
  const parts = [reference, title];
  for (const field of snapshot?.fields ?? []) {
    if (!field.searchable || field.system) continue;
    const text = formatAnswer(field, answers[field.key]);
    if (text) parts.push(text);
  }
  return parts.join("\n").slice(0, 20000);
}

function peopleRows(organizationId: string, incidentId: string, people: readonly PersonInput[]): Prisma.IncidentPersonCreateManyInput[] {
  return people.map((p, i) => ({
    organizationId,
    incidentId,
    name: p.name.trim(),
    userId: p.userId,
    personType: p.personType,
    involvement: p.involvement,
    injuryDetails: p.injuryDetails,
    injuryType: p.injuryType,
    bodyPart: p.bodyPart,
    sortOrder: i,
  }));
}

/**
 * Who a write is recorded against. The reporter of an anonymous report is never named: audit rows say
 * "Anonymous reporter" without IP address / browser, files are stored without an uploader and the
 * upload session (which names the uploader) is deleted once used.
 */
interface WriteActor {
  user: CurrentUser;
  anonymous: boolean;
}

function auditActor(w: WriteActor) {
  return w.anonymous ? ANONYMOUS_REPORTER : w.user;
}

function auditMeta(w: WriteActor, meta: RequestMeta): RequestMeta | undefined {
  return w.anonymous ? undefined : meta;
}

function writeActor(user: CurrentUser & IncidentPrincipal, facts: IncidentRecordFacts): WriteActor {
  return { user, anonymous: actsAsAnonymousReporter(user, facts) };
}

/** Consumes uploads referenced by `file` answers as evidence on the incident; answers keep the attachment ids. */
async function attachFileAnswers(tx: DbClient, w: WriteActor, incidentId: string, snapshot: QuestionnaireSnapshot, answers: FormValues): Promise<FormValues> {
  const { user } = w;
  const pending = pendingUploads(snapshot, answers);
  if (!pending.length) return answers;
  const out: FormValues = { ...answers };
  for (const item of pending) {
    const file = await uploadService.consume(item.uploadId, user, "evidence", tx, { forget: w.anonymous });
    const row = await tx.attachment.create({
      data: {
        organizationId: user.organizationId,
        entityType: INCIDENT_ENTITY,
        entityId: incidentId,
        kind: "FILE",
        name: file.fileName,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageDriver: file.storageDriver,
        storageKey: file.storageKey,
        uploadedById: w.anonymous ? null : user.id,
      },
    });
    const list = (out[item.fieldKey] as { uploadId?: string; attachmentId?: string; fileName: string; sizeBytes?: number }[]).map((f) =>
      f.uploadId === item.uploadId ? { attachmentId: row.id, fileName: f.fileName, sizeBytes: f.sizeBytes } : f,
    );
    out[item.fieldKey] = list;
  }
  return out;
}

async function attachEvidence(tx: DbClient, w: WriteActor, incidentId: string, uploadIds: readonly string[]): Promise<number> {
  const { user } = w;
  for (const uploadId of uploadIds) {
    const file = await uploadService.consume(uploadId, user, "evidence", tx, { forget: w.anonymous });
    await tx.attachment.create({
      data: {
        organizationId: user.organizationId,
        entityType: INCIDENT_ENTITY,
        entityId: incidentId,
        kind: "FILE",
        name: file.fileName,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageDriver: file.storageDriver,
        storageKey: file.storageKey,
        uploadedById: w.anonymous ? null : user.id,
      },
    });
  }
  return uploadIds.length;
}

interface PreparedReport {
  type: { id: string; name: string; isActive: boolean; multipleInvestigators: boolean; assignmentRequired: boolean; defaultConfidential: boolean; attachmentsAllowed: boolean; targetDays: number };
  subtype: { id: string; name: string } | null;
  placement: ResolvedPlacement;
  snapshot: QuestionnaireSnapshot;
  answers: FormValues;
  facts: ReportFacts;
  occurredAt: Date | null;
  targetDate: string | null;
  shift: string | null;
}

/**
 * Validates a report against its type, placement and captured questionnaire. Runs BEFORE the
 * write transaction (reads only). Throws 422 for malformed data; gates are returned as facts.
 */
async function prepareReport(
  db: DbClient,
  input: Omit<IncidentCreateInput, "clientId" | "submit" | "evidenceUploadIds" | "formVersionId" | "anonymous">,
  ctx: { versionId: string | null; existingSnapshot: QuestionnaireSnapshot | null; currentSubtypeId: string | null; currentShift: string | null; isNew: boolean },
): Promise<PreparedReport> {
  const type = await db.incidentType.findUnique({ where: { id: input.typeId }, include: { subtypes: true } });
  if (!type) throw new ValidationError("Choose an incident type.");
  if (ctx.isNew && !type.isActive) throw new ValidationError(`${type.name} is not an active incident type.`);
  const subtype = input.subtypeId ? type.subtypes.find((s) => s.id === input.subtypeId) : undefined;
  if (input.subtypeId && !subtype) throw new ValidationError("Choose a subtype of the selected incident type.");
  const subtypeValid = Boolean(subtype && (subtype.isActive || subtype.id === ctx.currentSubtypeId));

  const placement = await resolvePlacement({ departmentId: input.departmentId }, db);
  if (input.departmentId) {
    const dept = await db.department.findUnique({ where: { id: input.departmentId }, select: { isActive: true } });
    if (!dept?.isActive && ctx.isNew) throw new ValidationError("Choose an active department.");
  }

  // Captured questionnaire: kept for the life of the report; re-filtered (same version) when the site changes.
  let snapshot = ctx.existingSnapshot;
  if (!snapshot || snapshot.siteId !== placement.siteId) {
    const versionId = snapshot?.versionId ?? ctx.versionId;
    if (!versionId) throw new ValidationError(`${type.name} has no published Report form yet – ask an administrator to bind one in Configuration → Incident settings.`);
    snapshot = await captureIncidentForm(db, versionId, "REPORT", placement.siteId);
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : null;
  const targetDate = input.investigationTargetDate ?? (occurredAt ? addDays(occurredAt.toISOString(), type.targetDays) : null);
  const site = await placementLabel(db, placement);
  const answers = composeAnswers(snapshot, asAnswers(input.answers), {
    title: input.title,
    occurredAt: occurredAt ? occurredAt.toISOString() : null,
    narrative: input.narrative,
    site,
  });
  const check = checkAnswers(snapshot, answers, "REPORT");
  const shift = await listLabel(db, "incident.shift", input.shift, ctx.currentShift, "shift");

  await assertUsers(db, input.investigatorIds, "investigators");
  await assertUsers(db, input.notifyUserIds, "notification recipients");
  const personUserIds = input.people.map((p) => p.userId).filter((v): v is string => Boolean(v));
  if (personUserIds.length) {
    const found = await db.user.count({ where: { id: { in: [...new Set(personUserIds)] } } });
    if (found !== new Set(personUserIds).size) throw new ValidationError("Unknown person in the people list.");
  }

  return {
    type,
    subtype: subtype ? { id: subtype.id, name: subtype.name } : null,
    placement,
    snapshot,
    answers: check.data,
    occurredAt,
    targetDate,
    shift,
    facts: {
      title: input.title,
      occurredAt: occurredAt?.toISOString() ?? null,
      departmentId: placement.departmentId,
      investigationTargetDate: targetDate,
      typeActive: type.isActive,
      typeHasSubtypes: type.subtypes.some((s) => s.isActive),
      subtypeId: input.subtypeId,
      subtypeValid,
      people: input.people,
      investigatorCount: new Set(input.investigatorIds).size,
      assignmentRequired: type.assignmentRequired,
      multipleInvestigators: type.multipleInvestigators,
      missingAnswers: [...check.missing.filter((l) => !isMappedLabel(snapshot!, l)), ...check.problems],
      now: new Date(Date.now() + 5 * 60_000).toISOString(),
    },
  };
}

/** Missing mandatory questions that map to workflow controls are reported by their own gate. */
function isMappedLabel(snapshot: QuestionnaireSnapshot, label: string): boolean {
  const field = snapshot.fields.find((f) => f.label === label);
  return Boolean(field && (Object.values(REPORT_SYSTEM_KEYS) as string[]).includes(field.key) && field.key !== REPORT_SYSTEM_KEYS.narrative);
}

function blocked(message: string, blockers: string[]): never {
  throw new BusinessRuleError(`${message}: ${blockers.join(" ")}`, { blockers });
}

async function notifyInvestigators(db: DbClient, actor: CurrentUser, incident: { id: string; reference: string; title: string }, userIds: readonly string[]): Promise<void> {
  const recipients = userIds.filter((id) => id !== actor.id);
  if (!recipients.length) return;
  await notificationService.notify(
    {
      userIds: recipients,
      type: "incident.assigned",
      title: `${incident.reference} – you have been asked to investigate`,
      body: incident.title,
      link: incidentHref(incident.id),
      entityType: INCIDENT_ENTITY,
      entityId: incident.id,
      dedupeKey: `incident.assigned:${incident.id}`,
    },
    db,
  );
}

export const incidentService = {
  /** Report an incident (draft or submitted). Idempotent on `clientId` (wizard retries, offline sync). */
  async create(input: IncidentCreateInput, user: CurrentUser, meta: RequestMeta, options: { source?: "OFFLINE_SYNC" } = {}): Promise<IncidentWriteResult> {
    const clientId = input.clientId ? (input.anonymous ? anonymousClientId(input.clientId) : input.clientId) : null;
    if (clientId) {
      const existing = await prisma.incident.findUnique({
        where: { clientId },
        select: { id: true, reference: true, isDraft: true, reporterId: true, anonymousReporterKey: true },
      });
      if (existing) {
        if (!isReporter(user, existing)) throw new ValidationError("This report id is already in use.");
        return { id: existing.id, reference: existing.reference, isDraft: existing.isDraft, created: false };
      }
    }
    const type = await prisma.incidentType.findUnique({ where: { id: input.typeId }, select: { reportFormId: true } });
    if (!type) throw new ValidationError("Choose an incident type.");
    const versionId = input.formVersionId ?? (await publishedVersionId(prisma, type.reportFormId));
    const prepared = await prepareReport(prisma, input, { versionId, existingSnapshot: null, currentSubtypeId: null, currentShift: null, isNew: true });

    const gates = input.submit ? submitBlockers(prepared.facts) : draftBlockers(prepared.facts);
    if (gates.length) blocked(input.submit ? "The report cannot be submitted yet" : "The draft cannot be saved yet", gates);
    if (input.evidenceUploadIds.length && !prepared.type.attachmentsAllowed) throw new ValidationError(`Attachments are not allowed on ${prepared.type.name} reports.`);

    const organizationId = requireTenantId();
    const w: WriteActor = { user, anonymous: input.anonymous };
    const result = await prisma.$transaction(async (tx) => {
      const reference = await numberingService.next(tx, "incident");
      const now = new Date();
      const incident = await tx.incident.create({
        data: {
          organizationId,
          reference,
          clientId,
          typeId: prepared.type.id,
          typeLabel: prepared.type.name,
          subtypeId: prepared.subtype?.id ?? null,
          subtypeLabel: prepared.subtype?.name ?? null,
          title: input.title.trim(),
          narrative: input.narrative,
          severity: input.severity,
          ...prepared.placement,
          preciseLocation: input.preciseLocation,
          shift: prepared.shift,
          occurredAt: prepared.occurredAt,
          investigationTargetDate: prepared.targetDate ? toDate(prepared.targetDate) : null,
          isConfidential: input.isConfidential ?? prepared.type.defaultConfidential,
          isDraft: !input.submit,
          submittedAt: input.submit ? now : null,
          reporterId: input.anonymous ? null : user.id,
          isAnonymous: input.anonymous,
          anonymousReporterKey: input.anonymous ? anonymousReporterKey(user.id) : null,
          immediateAction: input.immediateAction,
          firstAid: input.firstAid,
          nurseNotified: input.nurseNotified,
          notifyUserIds: [...new Set(input.notifyUserIds)],
          reportForm: JSON.parse(JSON.stringify(prepared.snapshot)) as Prisma.InputJsonValue,
          answers: {},
          status: input.submit ? "OPEN" : "DRAFT",
        },
        select: { id: true },
      });
      const answers = await attachFileAnswers(tx, w, incident.id, prepared.snapshot, prepared.answers);
      await tx.incident.update({
        where: { id: incident.id },
        data: { answers: JSON.parse(JSON.stringify(answers)) as Prisma.InputJsonValue, searchText: searchTextFor(input.title, reference, prepared.snapshot, answers) },
      });
      if (input.people.length) await tx.incidentPerson.createMany({ data: peopleRows(organizationId, incident.id, input.people) });
      const investigatorIds = [...new Set(input.investigatorIds)];
      if (investigatorIds.length) {
        await tx.incidentInvestigator.createMany({ data: investigatorIds.map((userId) => ({ organizationId, incidentId: incident.id, userId })) });
      }
      const attached = await attachEvidence(tx, w, incident.id, input.evidenceUploadIds);
      await recordAudit(
        {
          entityType: INCIDENT_ENTITY,
          entityId: incident.id,
          action: input.submit ? INCIDENT_AUDIT.REPORTED : INCIDENT_AUDIT.DRAFT_SAVED,
          actor: auditActor(w),
          changes: { reference, title: input.title, type: prepared.type.name, subtype: prepared.subtype?.name ?? null, severity: input.severity },
          metadata: {
            formVersion: prepared.snapshot.version,
            formName: prepared.snapshot.name,
            attachments: attached,
            ...(input.anonymous ? { anonymous: true } : {}),
            ...(options.source ? { source: options.source } : {}),
          },
          meta: auditMeta(w, meta),
        },
        tx,
      );
      if (input.submit) await notifyInvestigators(tx, user, { id: incident.id, reference, title: input.title }, investigatorIds);
      return { id: incident.id, reference, isDraft: !input.submit, created: true };
    });
    return result;
  },

  /** Ordinary report editing (closed reports must be reopened first). Submitted reports must stay complete. */
  async update(id: string, input: IncidentUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<IncidentWriteResult> {
    const row = await loadVisibleIncident(prisma, user, id);
    const facts = recordFacts(row);
    if (facts.closed) throw new BusinessRuleError("Reopen the incident before editing the report.", { blockers: ["The incident is closed – reopen it to edit the report."] });
    if (facts.archived) throw new BusinessRuleError("Restore the incident before editing it.");
    if (!canEditReport(user, facts)) throw new ForbiddenError();
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const w = writeActor(user, facts);

    const prepared = await prepareReport(prisma, input, {
      versionId: null,
      existingSnapshot: asSnapshot(row.reportForm),
      currentSubtypeId: row.subtypeId,
      currentShift: row.shift,
      isNew: false,
    });
    const gates = row.isDraft ? draftBlockers(prepared.facts) : submitBlockers(prepared.facts);
    if (gates.length) blocked(row.isDraft ? "The draft cannot be saved yet" : "A submitted report must stay complete", gates);

    const organizationId = requireTenantId();
    return prisma.$transaction(async (tx) => {
      const answers = await attachFileAnswers(tx, w, id, prepared.snapshot, prepared.answers);
      const data = {
        typeId: prepared.type.id,
        typeLabel: prepared.type.id === row.typeId ? undefined : prepared.type.name,
        subtypeId: prepared.subtype?.id ?? null,
        // Keep the historical label when the subtype did not change (it may have been renamed since).
        subtypeLabel: prepared.subtype && prepared.subtype.id === row.subtypeId ? undefined : (prepared.subtype?.name ?? null),
        title: input.title.trim(),
        narrative: input.narrative,
        severity: input.severity,
        ...prepared.placement,
        preciseLocation: input.preciseLocation,
        shift: prepared.shift,
        occurredAt: prepared.occurredAt,
        investigationTargetDate: prepared.targetDate ? toDate(prepared.targetDate) : null,
        isConfidential: input.isConfidential ?? row.isConfidential,
        immediateAction: input.immediateAction,
        firstAid: input.firstAid,
        nurseNotified: input.nurseNotified,
        notifyUserIds: [...new Set(input.notifyUserIds)],
      };
      const updated = await tx.incident.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          ...data,
          reportForm: JSON.parse(JSON.stringify(prepared.snapshot)) as Prisma.InputJsonValue,
          answers: JSON.parse(JSON.stringify(answers)) as Prisma.InputJsonValue,
          searchText: searchTextFor(input.title, row.reference, prepared.snapshot, answers),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await tx.incidentPerson.deleteMany({ where: { incidentId: id } });
      if (input.people.length) await tx.incidentPerson.createMany({ data: peopleRows(organizationId, id, input.people) });
      const before = row.investigators.map((i) => i.userId);
      const after = [...new Set(input.investigatorIds)];
      const added = after.filter((u) => !before.includes(u));
      await tx.incidentInvestigator.deleteMany({ where: { incidentId: id, userId: { notIn: after } } });
      if (added.length) await tx.incidentInvestigator.createMany({ data: added.map((userId) => ({ organizationId, incidentId: id, userId })), skipDuplicates: true });
      const changes = diff(row as unknown as Record<string, unknown>, { ...data, typeLabel: undefined } as Record<string, unknown>, [
        "title",
        "narrative",
        "severity",
        "departmentId",
        "preciseLocation",
        "shift",
        "occurredAt",
        "investigationTargetDate",
        "isConfidential",
        "immediateAction",
        "firstAid",
        "nurseNotified",
        "typeId",
        "subtypeId",
      ]);
      await recordAudit(
        {
          entityType: INCIDENT_ENTITY,
          entityId: id,
          action: INCIDENT_AUDIT.UPDATED,
          actor: auditActor(w),
          changes: { ...(changes ?? {}), ...(added.length || before.length !== after.length ? { investigators: { from: before, to: after } } : {}) },
          meta: auditMeta(w, meta),
        },
        tx,
      );
      if (!row.isDraft && added.length) await notifyInvestigators(tx, user, { id, reference: row.reference, title: input.title }, added);
      await refreshIncidentStatus(tx, [id]);
      return { id, reference: row.reference, isDraft: row.isDraft, created: false };
    });
  },

  /** Submit a saved draft (all submission gates). */
  async submit(id: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<IncidentWriteResult> {
    const row = await prisma.incident.findFirst({
      where: { AND: [{ id }, incidentVisibleWhere(user)] },
      select: { ...recordSelect, people: { select: { name: true } } },
    });
    if (!row) throw new NotFoundError();
    const facts = recordFacts(row);
    if (!row.isDraft) throw new BusinessRuleError("This report has already been submitted.");
    if (!canSubmitReport(user, facts)) throw new ForbiddenError();
    if (row.version !== expectedVersion) throw new StaleVersionError();
    const prepared = await prepareReport(
      prisma,
      {
        typeId: row.typeId,
        subtypeId: row.subtypeId,
        title: row.title,
        narrative: row.narrative,
        occurredAt: row.occurredAt?.toISOString() ?? null,
        severity: row.severity,
        departmentId: row.departmentId,
        preciseLocation: row.preciseLocation,
        shift: row.shift,
        investigationTargetDate: row.investigationTargetDate?.toISOString().slice(0, 10) ?? null,
        isConfidential: row.isConfidential,
        investigatorIds: row.investigators.map((i) => i.userId),
        notifyUserIds: row.notifyUserIds,
        people: row.people.map((p) => ({ name: p.name, userId: null, personType: "EMPLOYEE", involvement: "OTHER", injuryDetails: null, injuryType: null, bodyPart: null })),
        immediateAction: row.immediateAction,
        firstAid: row.firstAid,
        nurseNotified: row.nurseNotified,
        answers: asAnswers(row.answers),
      },
      { versionId: null, existingSnapshot: asSnapshot(row.reportForm), currentSubtypeId: row.subtypeId, currentShift: row.shift, isNew: false },
    );
    const gates = submitBlockers(prepared.facts);
    if (gates.length) blocked("The report cannot be submitted yet", gates);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.incident.updateMany({
        where: { id, version: expectedVersion, isDraft: true },
        data: {
          isDraft: false,
          submittedAt: new Date(),
          investigationTargetDate: prepared.targetDate ? toDate(prepared.targetDate) : null,
          answers: JSON.parse(JSON.stringify(prepared.answers)) as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      const w = writeActor(user, facts);
      await recordAudit({ entityType: INCIDENT_ENTITY, entityId: id, action: INCIDENT_AUDIT.SUBMITTED, actor: auditActor(w), meta: auditMeta(w, meta) }, tx);
      await refreshIncidentStatus(tx, [id]);
      await notifyInvestigators(tx, user, { id, reference: row.reference, title: row.title }, row.investigators.map((i) => i.userId));
      return { id, reference: row.reference, isDraft: false, created: false };
    });
  },

  async setArchived(id: string, archived: boolean, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleIncident(prisma, user, id);
    const facts = recordFacts(row);
    if (!canArchiveIncident(user, facts)) throw new ForbiddenError();
    if (Boolean(row.archivedAt) === archived) return;
    const w = writeActor(user, facts);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.incident.updateMany({
        where: { id, version: expectedVersion },
        data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit(
        { entityType: INCIDENT_ENTITY, entityId: id, action: archived ? INCIDENT_AUDIT.ARCHIVED : INCIDENT_AUDIT.RESTORED, actor: auditActor(w), meta: auditMeta(w, meta) },
        tx,
      );
    });
  },

  /** Explicit closure with a note; every gate is checked inside the transaction (422 lists what is missing). */
  async close(id: string, note: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleIncident(prisma, user, id);
    if (!canCloseIncident(user, recordFacts(row))) throw new ForbiddenError();
    await prisma.$transaction(async (tx) => {
      const current = await tx.incident.findUnique({
        where: { id },
        select: {
          version: true,
          isDraft: true,
          closedAt: true,
          type: { select: { investigationRequired: true } },
          investigation: { select: { status: true, actionsRequired: true } },
          actions: { select: { action: { select: { id: true, reference: true, state: true, parentActionId: true, archivedAt: true, incidents: { select: { incidentId: true } } } } } },
        },
      });
      if (!current) throw new NotFoundError();
      if (current.version !== expectedVersion) throw new StaleVersionError();
      const blockers = closureBlockers({ ...factsOf(current), investigationRequired: current.type.investigationRequired, closureNote: note });
      if (blockers.length) blocked("This incident cannot be closed yet", blockers);
      await tx.incident.updateMany({
        where: { id, version: expectedVersion },
        data: { closedAt: new Date(), closedById: user.id, closureNote: note.trim(), status: "CLOSED", version: { increment: 1 } },
      });
      await recordAudit({ entityType: INCIDENT_ENTITY, entityId: id, action: INCIDENT_AUDIT.CLOSED, actor: user, changes: { closureNote: note.trim() }, meta }, tx);
    });
  },

  /** Reopen to continue work; the original closure stays in the history. */
  async reopen(id: string, reason: string | null, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleIncident(prisma, user, id);
    if (!canCloseIncident(user, recordFacts(row))) throw new ForbiddenError();
    if (!row.closedAt) throw new BusinessRuleError("The incident is not closed.");
    await prisma.$transaction(async (tx) => {
      const updated = await tx.incident.updateMany({
        where: { id, version: expectedVersion, closedAt: { not: null } },
        data: { closedAt: null, closedById: null, closureNote: null, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit(
        { entityType: INCIDENT_ENTITY, entityId: id, action: INCIDENT_AUDIT.REOPENED, actor: user, changes: { previousClosureNote: row.closureNote, reason }, meta },
        tx,
      );
      await refreshIncidentStatus(tx, [id]);
    });
  },
};

/** Exposed for the follow-up contract (status of a raised incident). */
export function statusOfFacts(row: Parameters<typeof factsOf>[0]) {
  return deriveIncidentStatus(factsOf(row));
}
