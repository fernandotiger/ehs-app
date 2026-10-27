import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ACTION_STATE_LABELS, addDays, INCIDENT_STATUS_LABELS, type ActionStateKey } from "@/lib/incidents";
import { normaliseLabel } from "@/lib/lookups";
import type { Placement } from "@/lib/scope";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import { numberingService } from "@/server/modules/numbering/numbering.service";
import { resolvePlacement } from "@/server/modules/organisation/placement";
import { recordLinkService } from "@/server/modules/record-links/record-link.service";
import { requireTenantId } from "@/server/tenancy/context";
import { insertAction } from "./action.service";
import { actionGraph } from "./action-query.service";
import { captureIncidentForm, checkAnswers, publishedVersionId, REPORT_SYSTEM_KEYS } from "./forms";
import { toNode } from "./incident-query.service";
import { ACTION_ENTITY, actionHref, INCIDENT_ENTITY, incidentHref, refreshIncidentStatus, toDate } from "./support";
import { isActionResolved, submitBlockers } from "./workflow";

/**
 * Follow-up contract for other modules (Audit, Inspection, Law – later phases). Each call runs in
 * the CALLER's transaction and is idempotent per source (RecordLink unique key + advisory lock):
 * repeating "raise" for the same source/question returns the existing record.
 *
 *   const { incidentId } = await raiseIncidentDraft(tx, user, { typeKey: "audit-non-conformance", … });
 *   const { actionId } = await raiseAction(tx, user, { kind: "corrective-action", … });
 *   const status = await followUpStatus("CorrectiveAction", actionId); // { resolved, label, href }
 */

export interface FollowUpSource {
  /** Originating entity type, e.g. "AuditFinding", "InspectionQuestion", "LegalChecklistItem". */
  type: string;
  id: string;
  /** Finer source inside the record (e.g. question id). */
  key?: string | null;
  /** Shown on the incident/action, e.g. "AUD-2026-0003 · Q4 Fire exits". */
  label: string;
  href: string;
}

export interface RaiseIncidentDraftInput {
  /** Incident type key (catalogue.ts), e.g. "audit-non-conformance", "inspection-finding", "non-compliance". */
  typeKey: string;
  /** Preferred subtype by name; otherwise the first active subtype. */
  subtypeLabel?: string | null;
  title: string;
  narrative?: string | null;
  /** Most specific structure node – department preferred (sets site/location/business unit). */
  placement: Placement;
  /** Assigned investigator (e.g. auditee, inspector-selected follow-up owner). */
  ownerId?: string | null;
  source: FollowUpSource;
  /** Existing attachments of the source record to carry over as incident evidence. */
  evidenceAttachmentIds?: string[];
}

export interface RaiseActionInput {
  kind: "corrective-action" | "preventive-action";
  description: string;
  ownerId: string;
  /** yyyy-mm-dd */
  dueDate: string;
  placement: Placement;
  reviewerId?: string | null;
  source: FollowUpSource;
}

export async function raiseIncidentDraft(tx: DbClient, user: CurrentUser, input: RaiseIncidentDraftInput): Promise<{ incidentId: string; reference: string; created: boolean; isDraft: boolean }> {
  let isDraft = true;
  let reference = "";
  const { link, created } = await recordLinkService.ensure(
    tx,
    { sourceType: input.source.type, sourceId: input.source.id, sourceKey: input.source.key ?? "", kind: "incident" },
    async (db) => {
      const organizationId = requireTenantId();
      const type = await db.incidentType.findUnique({ where: { organizationId_key: { organizationId, key: input.typeKey } }, include: { subtypes: true } });
      if (!type) throw new ValidationError(`Unknown incident type "${input.typeKey}".`);
      const active = type.subtypes.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
      const subtype = (input.subtypeLabel ? active.find((s) => normaliseLabel(s.name) === normaliseLabel(input.subtypeLabel!)) : undefined) ?? active[0] ?? null;
      const placement = await resolvePlacement(input.placement, db);
      const versionId = await publishedVersionId(db, type.reportFormId);
      if (!versionId) throw new ValidationError(`${type.name} has no published Report form – bind one in Configuration → Incident settings.`);
      const snapshot = await captureIncidentForm(db, versionId, "REPORT", placement.siteId);
      if (input.ownerId) {
        const owner = await db.user.count({ where: { id: input.ownerId, isActive: true } });
        if (!owner) throw new ValidationError("Choose an active follow-up owner.");
      }
      const now = new Date();
      const answers: Record<string, unknown> = {};
      const keys = new Set(snapshot.fields.map((f) => f.key));
      if (keys.has(REPORT_SYSTEM_KEYS.title)) answers[REPORT_SYSTEM_KEYS.title] = input.title;
      if (keys.has(REPORT_SYSTEM_KEYS.occurredAt)) answers[REPORT_SYSTEM_KEYS.occurredAt] = now.toISOString();
      if (keys.has(REPORT_SYSTEM_KEYS.narrative) && input.narrative) answers[REPORT_SYSTEM_KEYS.narrative] = input.narrative;
      const check = checkAnswers(snapshot, answers, "REPORT");
      const targetDate = addDays(now.toISOString(), type.targetDays);
      // Missing required answers (and the people involved) keep it a Draft for someone to complete.
      const gates = submitBlockers({
        title: input.title,
        occurredAt: now.toISOString(),
        departmentId: placement.departmentId,
        investigationTargetDate: targetDate,
        typeActive: type.isActive,
        typeHasSubtypes: active.length > 0,
        subtypeId: subtype?.id ?? null,
        subtypeValid: Boolean(subtype),
        people: [],
        investigatorCount: input.ownerId ? 1 : 0,
        assignmentRequired: type.assignmentRequired,
        multipleInvestigators: type.multipleInvestigators,
        missingAnswers: [...check.missing, ...check.problems],
      });
      isDraft = gates.length > 0;
      reference = await numberingService.next(db, "incident");
      const incident = await db.incident.create({
        data: {
          organizationId,
          reference,
          typeId: type.id,
          typeLabel: type.name,
          subtypeId: subtype?.id ?? null,
          subtypeLabel: subtype?.name ?? null,
          title: input.title.trim().slice(0, 200),
          narrative: input.narrative ?? null,
          ...placement,
          occurredAt: now,
          investigationTargetDate: toDate(targetDate),
          isConfidential: type.defaultConfidential,
          isDraft,
          submittedAt: isDraft ? null : now,
          reporterId: user.id,
          reportForm: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
          answers: JSON.parse(JSON.stringify(check.data)) as Prisma.InputJsonValue,
          searchText: `${reference}\n${input.title}`,
          status: isDraft ? "DRAFT" : "OPEN",
          sourceType: input.source.type,
          sourceId: input.source.id,
          sourceKey: input.source.key ?? null,
          sourceLabel: input.source.label,
          sourceHref: input.source.href,
        },
        select: { id: true },
      });
      if (input.ownerId) await db.incidentInvestigator.create({ data: { organizationId, incidentId: incident.id, userId: input.ownerId } });
      await copyEvidence(db, user, incident.id, input.evidenceAttachmentIds ?? []);
      await recordAudit(
        {
          entityType: INCIDENT_ENTITY,
          entityId: incident.id,
          action: isDraft ? "INCIDENT_DRAFT_SAVED" : "INCIDENT_REPORTED",
          actor: user,
          changes: { reference, title: input.title, type: type.name },
          metadata: { source: { type: input.source.type, id: input.source.id, key: input.source.key ?? null, label: input.source.label } },
        },
        db,
      );
      return { targetType: INCIDENT_ENTITY, targetId: incident.id };
    },
    user.id,
  );
  if (!created) {
    const existing = await tx.incident.findUnique({ where: { id: link.targetId }, select: { reference: true, isDraft: true } });
    if (!existing) throw new NotFoundError();
    return { incidentId: link.targetId, reference: existing.reference, created: false, isDraft: existing.isDraft };
  }
  return { incidentId: link.targetId, reference, created: true, isDraft };
}

/** Copies the source record's evidence (same stored object) onto the incident. */
async function copyEvidence(db: DbClient, user: CurrentUser, incidentId: string, attachmentIds: readonly string[]): Promise<void> {
  if (!attachmentIds.length) return;
  const rows = await db.attachment.findMany({ where: { id: { in: [...attachmentIds] }, removedAt: null } });
  for (const a of rows) {
    await db.attachment.create({
      data: {
        organizationId: a.organizationId,
        entityType: INCIDENT_ENTITY,
        entityId: incidentId,
        kind: a.kind,
        name: a.name,
        url: a.url,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        storageDriver: a.storageDriver,
        storageKey: a.storageKey,
        uploadedById: user.id,
      },
    });
  }
}

/** Corrective/preventive action from another module's finding – no incident needed when a source is given. */
export async function raiseAction(tx: DbClient, user: CurrentUser, input: RaiseActionInput): Promise<{ actionId: string; reference: string; created: boolean }> {
  let reference = "";
  const { link, created } = await recordLinkService.ensure(
    tx,
    { sourceType: input.source.type, sourceId: input.source.id, sourceKey: input.source.key ?? "", kind: input.kind },
    async (db) => {
      const owner = await db.user.count({ where: { id: input.ownerId, isActive: true } });
      if (!owner) throw new ValidationError("Choose an active action owner.");
      if (input.reviewerId) {
        const reviewer = await db.user.count({ where: { id: input.reviewerId, isActive: true } });
        if (!reviewer) throw new ValidationError("Choose an active reviewer.");
      }
      const placement = await resolvePlacement(input.placement, db);
      const action = await insertAction(db, user, {
        description: input.description,
        kind: input.kind === "preventive-action" ? "PREVENTIVE" : "CORRECTIVE",
        ownerId: input.ownerId,
        placement,
        dueDate: input.dueDate,
        priority: "NORMAL",
        capaCategory: null,
        reviewerId: input.reviewerId ?? null,
        plannedReviewDate: null,
        incidentIds: [],
        source: input.source,
      });
      reference = action.reference;
      return { targetType: ACTION_ENTITY, targetId: action.id };
    },
    user.id,
  );
  if (!created) {
    const existing = await tx.correctiveAction.findUnique({ where: { id: link.targetId }, select: { reference: true } });
    if (!existing) throw new NotFoundError();
    return { actionId: link.targetId, reference: existing.reference, created: false };
  }
  return { actionId: link.targetId, reference, created: true };
}

/**
 * Is the follow-up done? Incident → explicitly Closed. Action → Effective, or Ineffective with every
 * applicable follow-up effectively resolved. Lets origins show "linked action still open".
 */
export async function followUpStatus(targetType: string, targetId: string, db: DbClient = prisma): Promise<{ resolved: boolean; label: string; href: string }> {
  if (targetType === INCIDENT_ENTITY) {
    const row = await db.incident.findUnique({ where: { id: targetId }, select: { id: true, reference: true, status: true } });
    if (!row) throw new NotFoundError();
    await refreshIncidentStatus(db, [row.id]);
    const fresh = await db.incident.findUnique({ where: { id: targetId }, select: { status: true } });
    const status = fresh?.status ?? row.status;
    return { resolved: status === "CLOSED", label: `${row.reference} · ${INCIDENT_STATUS_LABELS[status]}`, href: incidentHref(row.id) };
  }
  if (targetType === ACTION_ENTITY) {
    const row = await db.correctiveAction.findUnique({ where: { id: targetId }, select: { id: true, reference: true, state: true, parentActionId: true, incidents: { select: { incidentId: true } } } });
    if (!row) throw new NotFoundError();
    const graph = await actionGraph(db, toNode(row));
    const resolved = isActionResolved(graph[0]!, graph);
    const state = row.state as ActionStateKey;
    const label = state === "INEFFECTIVE" && !resolved ? `${row.reference} · Ineffective – follow-up open` : `${row.reference} · ${ACTION_STATE_LABELS[state]}`;
    return { resolved, label, href: actionHref(row.id) };
  }
  throw new ValidationError(`Unknown follow-up type "${targetType}".`);
}
