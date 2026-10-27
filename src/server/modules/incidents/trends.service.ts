import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { SEVERITY_LABELS } from "@/lib/incidents";
import type { TrendActionInput, TrendCriteriaInput } from "@/lib/validation/incidents";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ForbiddenError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { resolvePlacement } from "@/server/modules/organisation/placement";
import { ACTION_AUDIT, actionFacts, insertAction, loadVisibleAction } from "./action.service";
import { canEditAction, canRaiseAction, incidentVisibleWhere } from "./incident-access.policy";
import { causeCatalogue, listLabel } from "./incident-lookups";
import { recordFacts } from "./incident.service";
import type { TrendPreviewDto, TrendSnapshotDto } from "./incident.dto";
import { ACTION_ENTITY, iso, loadNames, toDate } from "./support";
import { matchesTrend, trendCriteriaErrors, type TrendCriteria } from "./workflow";

/** Trends & prevention: preview matching incidents, create a preventive action with a snapshot, explicit refresh. */

function blocked(message: string, blockers: string[]): never {
  throw new BusinessRuleError(`${message}: ${blockers.join(" ")}`, { blockers });
}

function criteriaOf(input: TrendCriteriaInput): TrendCriteria {
  return { from: input.from, to: input.to, typeId: input.typeId, subtypeId: input.subtypeId, causeId: input.causeId, departmentId: input.departmentId };
}

async function matches(db: DbClient, user: CurrentUser, c: TrendCriteria) {
  const rows = await db.incident.findMany({
    where: {
      AND: [
        incidentVisibleWhere(user),
        { archivedAt: null, isDraft: false, occurredAt: { gte: toDate(c.from), lt: new Date(toDate(c.to).getTime() + 86_400_000) } },
        c.typeId ? { typeId: c.typeId } : {},
        c.subtypeId ? { subtypeId: c.subtypeId } : {},
        c.departmentId ? { departmentId: c.departmentId } : {},
        c.causeId ? { investigation: { causeIds: { has: c.causeId } } } : {},
      ],
    },
    select: {
      id: true,
      reference: true,
      title: true,
      occurredAt: true,
      typeId: true,
      typeLabel: true,
      subtypeId: true,
      subtypeLabel: true,
      severity: true,
      departmentId: true,
      isDraft: true,
      archivedAt: true,
      investigation: { select: { causeIds: true } },
    },
    orderBy: { occurredAt: "asc" },
    take: 1000,
  });
  // Same rule as the pure workflow (keeps the SQL and the tested rule aligned).
  return rows.filter((r) =>
    matchesTrend(
      { isDraft: r.isDraft, archived: Boolean(r.archivedAt), occurredAt: iso(r.occurredAt), typeId: r.typeId, subtypeId: r.subtypeId, departmentId: r.departmentId, causeIds: r.investigation?.causeIds ?? [] },
      c,
    ),
  );
}

function tally(values: string[]): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

async function criteriaLabels(db: DbClient, c: TrendCriteria): Promise<Record<string, string>> {
  const labels: Record<string, string> = {};
  if (c.typeId) labels.type = (await db.incidentType.findUnique({ where: { id: c.typeId }, select: { name: true } }))?.name ?? "";
  if (c.subtypeId) labels.subtype = (await db.incidentSubtype.findUnique({ where: { id: c.subtypeId }, select: { name: true } }))?.name ?? "";
  if (c.departmentId) labels.department = (await db.department.findUnique({ where: { id: c.departmentId }, select: { name: true } }))?.name ?? "";
  if (c.causeId) labels.cause = (await db.lookupValue.findUnique({ where: { id: c.causeId }, select: { label: true } }))?.label ?? "";
  return labels;
}

export const trendsService = {
  async preview(user: CurrentUser, input: TrendCriteriaInput): Promise<TrendPreviewDto> {
    const criteria = criteriaOf(input);
    const errors = trendCriteriaErrors(criteria);
    if (errors.length) blocked("Check the trend criteria", errors);
    const rows = await matches(prisma, user, criteria);
    const [names, causes] = await Promise.all([loadNames(prisma, { departments: rows.map((r) => r.departmentId) }), causeCatalogue(prisma)]);
    return {
      criteria,
      matches: rows.map((r) => ({
        id: r.id,
        reference: r.reference,
        title: r.title,
        occurredAt: iso(r.occurredAt),
        typeLabel: r.typeLabel,
        subtypeLabel: r.subtypeLabel,
        severity: r.severity,
        departmentName: r.departmentId ? (names.departments.get(r.departmentId) ?? null) : null,
      })),
      summary: {
        byType: tally(rows.map((r) => (r.subtypeLabel ? `${r.typeLabel} · ${r.subtypeLabel}` : r.typeLabel))),
        bySeverity: tally(rows.map((r) => SEVERITY_LABELS[r.severity])),
        byDepartment: tally(rows.map((r) => (r.departmentId ? (names.departments.get(r.departmentId) ?? "Unknown") : "No department"))),
        byCause: tally(rows.flatMap((r) => (r.investigation?.causeIds ?? []).map((id) => causes.get(id)?.label ?? "Unknown"))),
      },
    };
  },

  /** Preventive action from selected trend results; keeps criteria, matched references and capture time (I-11). */
  async createPreventive(user: CurrentUser, input: TrendActionInput, meta: RequestMeta): Promise<{ id: string; reference: string }> {
    const criteria = criteriaOf(input.criteria);
    const errors = trendCriteriaErrors(criteria);
    if (errors.length) blocked("Check the trend criteria", errors);
    const rows = await matches(prisma, user, criteria);
    const matchedIds = new Set(rows.map((r) => r.id));
    const selected = [...new Set(input.incidentIds)];
    if (selected.some((id) => !matchedIds.has(id))) throw new ValidationError("Select incidents from the trend results.");
    const linkable = await prisma.incident.findMany({
      where: { id: { in: selected } },
      select: { id: true, reporterId: true, isDraft: true, isConfidential: true, closedAt: true, archivedAt: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true, investigators: { select: { userId: true } } },
    });
    // Closed incidents are part of a trend too; the action is linked to the open ones the user may act on.
    const links = linkable.filter((i) => !i.closedAt && canRaiseAction(user, recordFacts(i))).map((i) => i.id);
    const placement = input.departmentId ? await resolvePlacement({ departmentId: input.departmentId }) : { businessUnitId: null, siteId: null, locationId: null, departmentId: null };
    if (!links.length && !canEditAction(user, { ...placement, ownerId: input.ownerId, reviewerId: input.reviewerId })) throw new ForbiddenError();
    const owner = await prisma.user.count({ where: { id: input.ownerId, isActive: true } });
    if (!owner) throw new ValidationError("Choose an active owner.");
    const capaCategory = await listLabel(prisma, "incident.capa-category", input.capaCategory, null, "action category");
    const trend: TrendSnapshotDto = {
      criteria: { ...criteria, labels: await criteriaLabels(prisma, criteria) },
      matched: rows.map((r) => ({ id: r.id, reference: r.reference })),
      capturedAt: new Date().toISOString(),
    };
    return prisma.$transaction((tx) =>
      insertAction(
        tx,
        user,
        {
          description: input.description,
          kind: "PREVENTIVE",
          ownerId: input.ownerId,
          placement,
          dueDate: input.dueDate,
          priority: input.priority,
          capaCategory,
          reviewerId: input.reviewerId,
          plannedReviewDate: input.plannedReviewDate,
          incidentIds: links,
          trend: JSON.parse(JSON.stringify(trend)) as Prisma.InputJsonValue,
        },
        meta,
      ),
    );
  },

  /** Explicit refresh: new matches and time; the action's associated incidents are NOT changed. */
  async refresh(user: CurrentUser, actionId: string, expectedVersion: number, meta: RequestMeta): Promise<TrendSnapshotDto> {
    const row = await loadVisibleAction(prisma, user, actionId);
    if (!canEditAction(user, actionFacts(row))) throw new ForbiddenError();
    const previous = row.trend as TrendSnapshotDto | null;
    if (!previous) blocked("No trend snapshot", ["This action was not created from a trend."]);
    if (row.version !== expectedVersion) throw new StaleVersionError();
    const criteria: TrendCriteria = {
      from: previous.criteria.from,
      to: previous.criteria.to,
      typeId: previous.criteria.typeId ?? null,
      subtypeId: previous.criteria.subtypeId ?? null,
      causeId: previous.criteria.causeId ?? null,
      departmentId: previous.criteria.departmentId ?? null,
    };
    const rows = await matches(prisma, user, criteria);
    const next: TrendSnapshotDto = { criteria: previous.criteria, matched: rows.map((r) => ({ id: r.id, reference: r.reference })), capturedAt: new Date().toISOString() };
    await prisma.$transaction(async (tx) => {
      const updated = await tx.correctiveAction.updateMany({
        where: { id: actionId, version: expectedVersion },
        data: { trend: JSON.parse(JSON.stringify(next)) as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit(
        {
          entityType: ACTION_ENTITY,
          entityId: actionId,
          action: ACTION_AUDIT.TREND_REFRESHED,
          actor: user,
          changes: { matched: { from: previous.matched.length, to: next.matched.length } },
          metadata: { previousCapturedAt: previous.capturedAt },
          meta,
        },
        tx,
      );
    });
    return next;
  },
};
