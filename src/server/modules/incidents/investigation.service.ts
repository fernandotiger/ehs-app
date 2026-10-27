import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { normaliseLabel } from "@/lib/lookups";
import type { InvestigationSaveInput } from "@/lib/validation/incidents";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ForbiddenError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { requireTenantId } from "@/server/tenancy/context";
import { asAnswers, asSnapshot, captureIncidentForm, checkAnswers, publishedVersionId } from "./forms";
import { canInvestigate, canCloseIncident } from "./incident-access.policy";
import { absenceKinds, assertSelectable, causeCatalogue, listLabel, reporteeCatalogue } from "./incident-lookups";
import { loadVisibleIncident, recordFacts } from "./incident.service";
import { INCIDENT_ENTITY, refreshIncidentStatus, toDate } from "./support";
import { investigationCompletionBlockers, investigationDataErrors } from "./workflow";

/** Investigation: start (captures the Investigation form), save in progress, complete, reopen. */

export const INVESTIGATION_AUDIT = {
  STARTED: "INVESTIGATION_STARTED",
  SAVED: "INVESTIGATION_SAVED",
  COMPLETED: "INVESTIGATION_COMPLETED",
  REOPENED: "INVESTIGATION_REOPENED",
} as const;

function blocked(message: string, blockers: string[]): never {
  throw new BusinessRuleError(`${message}: ${blockers.join(" ")}`, { blockers });
}

export const investigationService = {
  async start(incidentId: string, input: { formVersionId: string | null; investigatorId: string | null }, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleIncident(prisma, user, incidentId);
    const facts = recordFacts(row);
    if (!canInvestigate(user, facts)) throw new ForbiddenError();
    if (facts.isDraft) blocked("The investigation cannot start yet", ["Submit the report first."]);
    if (facts.closed) blocked("The investigation cannot start", ["Reopen the incident first."]);
    const [type, existing] = await Promise.all([
      prisma.incidentType.findUnique({ where: { id: row.typeId }, select: { name: true, investigationEnabled: true, investigationFormId: true } }),
      prisma.investigation.findUnique({ where: { incidentId }, select: { id: true, status: true } }),
    ]);
    if (!type?.investigationEnabled) blocked("No investigation", [`${type?.name ?? "This type"} does not use investigations.`]);
    if (existing) {
      if (existing.status === "IN_PROGRESS") return;
      blocked("The investigation is already completed", ["Reopen the investigation to change it."]);
    }
    const versionId = input.formVersionId ?? (await publishedVersionId(prisma, type.investigationFormId));
    if (!versionId) blocked("No investigation form", ["Bind a published Investigation form to this incident type first."]);
    const snapshot = await captureIncidentForm(prisma, versionId, "INVESTIGATION", row.siteId);
    const investigatorId = input.investigatorId ?? row.investigators[0]?.userId ?? user.id;
    const found = await prisma.user.count({ where: { id: investigatorId, isActive: true } });
    if (!found) throw new ValidationError("Choose an active investigator.");

    await prisma.$transaction(async (tx) => {
      await tx.investigation.create({
        data: {
          organizationId: requireTenantId(),
          incidentId,
          status: "IN_PROGRESS",
          investigatorId,
          form: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
          startedById: user.id,
        },
      });
      await recordAudit(
        {
          entityType: INCIDENT_ENTITY,
          entityId: incidentId,
          action: INVESTIGATION_AUDIT.STARTED,
          actor: user,
          metadata: { formName: snapshot.name, formVersion: snapshot.version, investigatorId },
          meta,
        },
        tx,
      );
      await refreshIncidentStatus(tx, [incidentId]);
    });
  },

  /** Save in progress (`complete: false`) or complete with every gate. A completed investigation is reopened, not edited. */
  async save(incidentId: string, input: InvestigationSaveInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleIncident(prisma, user, incidentId);
    const facts = recordFacts(row);
    if (!canInvestigate(user, facts)) throw new ForbiddenError();
    if (facts.closed) blocked("The investigation cannot change", ["The incident is closed – reopen it first."]);
    const current = await prisma.investigation.findUnique({ where: { incidentId }, include: { absences: true } });
    if (!current) throw new NotFoundError("No investigation has been started.");
    if (current.status !== "IN_PROGRESS") blocked("The investigation is completed", ["Reopen the investigation to change it."]);
    if (current.version !== input.expectedVersion) throw new StaleVersionError();

    const [causes, reportees, kinds] = await Promise.all([causeCatalogue(prisma), reporteeCatalogue(prisma), absenceKinds(prisma)]);
    const causeIds = [...new Set(input.causeIds)];
    const reporteeIds = input.reportable ? [...new Set(input.reporteeIds)] : [];
    assertSelectable(causes, causeIds, current.causeIds, "cause");
    assertSelectable(reportees, reporteeIds, current.reporteeIds, "reportee");
    const usedKinds = new Set(current.absences.map((a) => normaliseLabel(a.kind)));
    const absences = input.absences.map((a, i) => {
      const kind = kinds.get(normaliseLabel(a.kind));
      if (!kind) throw new ValidationError(`Absence period ${i + 1}: choose an absence kind from the list.`);
      if (!kind.isActive && !usedKinds.has(normaliseLabel(a.kind))) throw new ValidationError(`Absence period ${i + 1}: “${kind.label}” has been deactivated.`);
      return { ...a, kind: kind.label, restricted: kind.restricted };
    });
    const hazardGroup = input.healthSafetyImpact ? await listLabel(prisma, "incident.hazard-group", input.hazardGroup, current.hazardGroup, "hazard group") : null;
    const environmentalAspect = input.environmentalImpact
      ? await listLabel(prisma, "incident.environmental-aspect", input.environmentalAspect, current.environmentalAspect, "environmental aspect")
      : null;
    if (input.investigatorId) {
      const found = await prisma.user.count({ where: { id: input.investigatorId, isActive: true } });
      if (!found) throw new ValidationError("Choose an active investigator.");
    }

    const dataErrors = investigationDataErrors({ absences, operatingHoursLost: input.operatingHoursLost, environmentalDuration: input.environmentalDuration });
    if (dataErrors.length) blocked("Check the loss details", dataErrors);

    const snapshot = asSnapshot(current.form);
    const check = snapshot ? checkAnswers(snapshot, asAnswers(input.answers), "INVESTIGATION") : { data: asAnswers(input.answers), missing: [], problems: [] };
    if (input.complete) {
      const blockers = investigationCompletionBlockers({
        investigatorId: input.investigatorId,
        causeIds,
        closingDecision: input.closingDecision,
        actionsRequired: input.actionsRequired,
        healthSafetyImpact: input.healthSafetyImpact,
        hazardGroup,
        environmentalImpact: input.environmentalImpact,
        environmentalAspect,
        environmentalDescription: input.environmentalDescription,
        environmentalDuration: input.environmentalDuration,
        reportable: input.reportable,
        reporteeIds,
        absences,
        operatingHoursLost: input.operatingHoursLost,
        missingAnswers: [...check.missing, ...check.problems],
      });
      if (blockers.length) blocked("The investigation cannot be completed yet", blockers);
    }

    const organizationId = requireTenantId();
    const data = {
      investigatorId: input.investigatorId,
      healthSafetyImpact: input.healthSafetyImpact,
      hazardGroup,
      environmentalImpact: input.environmentalImpact,
      environmentalAspect,
      environmentalDescription: input.environmentalImpact ? input.environmentalDescription : null,
      environmentalDuration: input.environmentalImpact ? (input.environmentalDuration ?? null) : null,
      environmentalDurationUnit: input.environmentalImpact && input.environmentalDuration != null ? (input.environmentalDurationUnit ?? "MINUTES") : null,
      causeIds,
      reportable: input.reportable,
      reporteeIds,
      operatingHoursLost: input.operatingHoursLost ?? null,
      actionsRequired: input.actionsRequired ?? null,
      closingDecision: input.closingDecision,
    };
    await prisma.$transaction(async (tx) => {
      const updated = await tx.investigation.updateMany({
        where: { id: current.id, version: input.expectedVersion, status: "IN_PROGRESS" },
        data: {
          ...data,
          answers: JSON.parse(JSON.stringify(check.data)) as Prisma.InputJsonValue,
          ...(input.complete ? { status: "COMPLETED" as const, completedAt: new Date(), completedById: user.id } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await tx.absencePeriod.deleteMany({ where: { investigationId: current.id } });
      if (absences.length) {
        await tx.absencePeriod.createMany({
          data: absences.map((a, i) => ({
            organizationId,
            investigationId: current.id,
            startDate: toDate(a.startDate),
            endDate: toDate(a.endDate),
            kind: a.kind,
            restricted: a.restricted,
            note: a.note,
            sortOrder: i,
          })),
        });
      }
      await recordAudit(
        {
          entityType: INCIDENT_ENTITY,
          entityId: incidentId,
          action: input.complete ? INVESTIGATION_AUDIT.COMPLETED : INVESTIGATION_AUDIT.SAVED,
          actor: user,
          changes: diff(current as unknown as Record<string, unknown>, data as Record<string, unknown>),
          metadata: { absences: absences.length },
          meta,
        },
        tx,
      );
      await refreshIncidentStatus(tx, [incidentId]);
    });
  },

  /** Reopen a completed investigation: history is kept, and closure is unavailable until it completes again. */
  async reopen(incidentId: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleIncident(prisma, user, incidentId);
    const facts = recordFacts(row);
    if (!canInvestigate(user, facts) && !canCloseIncident(user, facts)) throw new ForbiddenError();
    if (facts.closed) blocked("The investigation cannot be reopened", ["Reopen the incident first."]);
    const current = await prisma.investigation.findUnique({ where: { incidentId } });
    if (!current) throw new NotFoundError();
    if (current.status !== "COMPLETED") return;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.investigation.updateMany({
        where: { id: current.id, version: expectedVersion, status: "COMPLETED" },
        data: { status: "IN_PROGRESS", completedAt: null, completedById: null, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit(
        {
          entityType: INCIDENT_ENTITY,
          entityId: incidentId,
          action: INVESTIGATION_AUDIT.REOPENED,
          actor: user,
          changes: { previousCompletedAt: current.completedAt?.toISOString() ?? null, previousClosingDecision: current.closingDecision },
          meta,
        },
        tx,
      );
      await refreshIncidentStatus(tx, [incidentId]);
    });
  },
};
