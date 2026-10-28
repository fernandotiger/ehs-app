import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { isActionOverdue } from "@/lib/actions";
import type { Paginated } from "@/lib/validation/common";
import type { ActionListQuery } from "@/lib/validation/actions";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import { localDate } from "@/server/modules/jobs/engine";
import type { ActionDetailDto, ActionHistoryEntry, ActionListItem, ActionSummaryDto } from "./action.dto";
import { actionRights, actionVisibleWhere } from "./action-access.policy";
import { ACTION_ENTITY, asAnswers, asSnapshot, dateOnly, loadNames, placementOf, toDate, todayFor, type NameMaps } from "./support";
import { lifecycle, nextStep } from "./workflow";

/** My Actions register, summary, detail and history (visibility: action.view in scope OR owner OR creator). */

const listSelect = {
  id: true,
  reference: true,
  title: true,
  status: true,
  priority: true,
  ownerId: true,
  createdById: true,
  dueDate: true,
  completedOn: true,
  updatedAt: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
} satisfies Prisma.ActionSelect;

type ListRow = Prisma.ActionGetPayload<{ select: typeof listSelect }>;

function namesFor(rows: readonly ListRow[], extraUsers: (string | null | undefined)[] = []) {
  return loadNames(prisma, {
    users: [...rows.flatMap((r) => [r.ownerId, r.createdById]), ...extraUsers],
    sites: rows.map((r) => r.siteId),
    departments: rows.map((r) => r.departmentId),
  });
}

function placeLabel(r: ListRow, names: NameMaps): string | null {
  const parts = [r.siteId ? names.sites.get(r.siteId) : null, r.departmentId ? names.departments.get(r.departmentId) : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function toListItem(r: ListRow, names: NameMaps, user: CurrentUser, today: string): ActionListItem {
  const dueDate = dateOnly(r.dueDate)!;
  return {
    id: r.id,
    reference: r.reference,
    title: r.title,
    status: r.status,
    priority: r.priority,
    owner: { id: r.ownerId, name: names.users.get(r.ownerId) ?? "Unknown" },
    createdBy: { id: r.createdById, name: names.users.get(r.createdById) ?? "Unknown" },
    dueDate,
    overdue: isActionOverdue(r.status, dueDate, today),
    completedOn: dateOnly(r.completedOn),
    placeLabel: placeLabel(r, names),
    assignedToMe: r.ownerId === user.id,
    createdByMe: r.createdById === user.id,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function actionWhere(user: CurrentUser, q: Omit<ActionListQuery, "page" | "pageSize" | "sort" | "dir">): Prisma.ActionWhereInput {
  const today = toDate(todayFor(user.timeZone));
  const and: Prisma.ActionWhereInput[] = [actionVisibleWhere(user), { archivedAt: null }];
  if (q.view === "mine") and.push({ OR: [{ ownerId: user.id }, { createdById: user.id }] });
  else if (q.view === "assigned") and.push({ ownerId: user.id });
  else if (q.view === "created") and.push({ createdById: user.id });
  if (q.status === "ACTIVE") and.push({ status: { in: ["OPEN", "IN_PROGRESS"] } });
  else if (q.status !== "ALL") and.push({ status: q.status });
  if (q.priority) and.push({ priority: q.priority });
  if (q.overdue === "true") and.push({ status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: today } });
  if (q.q) and.push({ OR: [{ reference: { contains: q.q, mode: "insensitive" } }, { title: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }] });
  return { AND: and };
}

function orderBy(q: Pick<ActionListQuery, "sort" | "dir">): Prisma.ActionOrderByWithRelationInput[] {
  switch (q.sort) {
    case "reference":
      return [{ reference: q.dir }];
    case "updatedAt":
      return [{ updatedAt: q.dir }];
    // Enum order in the database is LOW → URGENT, so "desc" puts urgent work first.
    case "priority":
      return [{ priority: q.dir === "asc" ? "desc" : "asc" }, { dueDate: "asc" }];
    default:
      return [{ dueDate: q.dir }, { reference: "asc" }];
  }
}

export const actionQueryService = {
  async list(user: CurrentUser, q: ActionListQuery): Promise<Paginated<ActionListItem>> {
    const where = actionWhere(user, q);
    const [rows, total] = await Promise.all([
      prisma.action.findMany({ where, select: listSelect, orderBy: orderBy(q), skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.action.count({ where }),
    ]);
    const names = await namesFor(rows);
    const today = todayFor(user.timeZone);
    return { items: rows.map((r) => toListItem(r, names, user, today)), total, page: q.page, pageSize: q.pageSize };
  },

  /** Counts for the My Actions banner and the Home widget. */
  async summary(user: CurrentUser): Promise<ActionSummaryDto> {
    const todayIso = todayFor(user.timeZone);
    const today = toDate(todayIso);
    const weekEnd = new Date(today.getTime() + 6 * 86_400_000);
    const open = { status: { in: ["OPEN", "IN_PROGRESS"] as ("OPEN" | "IN_PROGRESS")[] }, archivedAt: null };
    const [assigned, overdue, dueSoon, createdForOthers] = await Promise.all([
      prisma.action.count({ where: { ...open, ownerId: user.id } }),
      prisma.action.count({ where: { ...open, ownerId: user.id, dueDate: { lt: today } } }),
      prisma.action.count({ where: { ...open, ownerId: user.id, dueDate: { gte: today, lte: weekEnd } } }),
      prisma.action.count({ where: { ...open, createdById: user.id, ownerId: { not: user.id } } }),
    ]);
    return { assigned, overdue, dueSoon, createdForOthers };
  },

  async detail(user: CurrentUser, id: string): Promise<ActionDetailDto> {
    const row = await prisma.action.findFirst({
      where: { AND: [{ id }, { archivedAt: null }, actionVisibleWhere(user)] },
      select: {
        ...listSelect,
        description: true,
        version: true,
        createdAt: true,
        startedAt: true,
        completedById: true,
        completionNotes: true,
        cancelledAt: true,
        cancelledById: true,
        cancelReason: true,
        form: true,
        answers: true,
      },
    });
    if (!row) throw new NotFoundError();
    const names = await namesFor([row], [row.completedById, row.cancelledById]);
    const today = todayFor(user.timeZone);
    const rights = actionRights(user, { ...placementOf(row), ownerId: row.ownerId, createdById: row.createdById, status: row.status });
    return {
      ...toListItem(row, names, user, today),
      description: row.description,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      createdOn: localDate(row.createdAt, user.timeZone),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedByName: row.completedById ? (names.users.get(row.completedById) ?? null) : null,
      completionNotes: row.completionNotes,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelledByName: row.cancelledById ? (names.users.get(row.cancelledById) ?? null) : null,
      cancelReason: row.cancelReason,
      placement: placementOf(row),
      departmentName: row.departmentId ? (names.departments.get(row.departmentId) ?? null) : null,
      siteName: row.siteId ? (names.sites.get(row.siteId) ?? null) : null,
      form: asSnapshot(row.form),
      answers: asAnswers(row.answers),
      today,
      lifecycle: lifecycle(row.status, Boolean(row.startedAt)),
      nextStep: nextStep(row.status, rights),
      permissions: { ...rights, evidence: rights.edit || rights.work },
    };
  },

  /** Signed audit trail of the action (evidence added/removed is audited on the action too). */
  async history(user: CurrentUser, id: string, page: number, pageSize: number): Promise<Paginated<ActionHistoryEntry>> {
    const row = await prisma.action.findFirst({ where: { AND: [{ id }, actionVisibleWhere(user)] }, select: { id: true } });
    if (!row) throw new NotFoundError();
    const where: Prisma.AuditLogWhereInput = { entityType: ACTION_ENTITY, entityId: id };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((e) => ({ id: e.id, action: e.action, actorName: e.actorName, changes: e.changes, metadata: e.metadata, createdAt: e.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    };
  },
};
