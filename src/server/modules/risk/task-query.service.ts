import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { TaskListQuery } from "@/lib/validation/risk";
import type { Paginated } from "@/lib/validation/common";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import type { RiskMethod } from "@/lib/risk/scoring";
import type { TaskDetailDto, TaskListItem } from "./risk.dto";
import { assessmentVisibleWhere, canCreateTaskAt, canEditTask, canWorkOnTask, taskVisibleWhere } from "./risk-access.policy";
import { findFactor } from "./scoring";
import { dateOnly, loadNames, placementOf, todayFor, toDate, type NameMaps } from "./support";
import { isScoringTask, isTaskOverdue } from "./workflow";

/** Risk task registers and detail (visibility: risk.task.view in scope OR task owner). */

export const taskListSelect = {
  id: true,
  reference: true,
  kind: true,
  title: true,
  status: true,
  ownerId: true,
  createdOn: true,
  dueDate: true,
  completedOn: true,
  parentId: true,
  factor: true,
  originalValue: true,
  targetValue: true,
  actualValue: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
  programme: { select: { id: true, title: true } },
  assessment: { select: { id: true, reference: true, title: true, method: true, domain: true } },
  hazard: { select: { id: true, name: true } },
  parent: { select: { reference: true } },
  subTasks: { select: { status: true } },
} satisfies Prisma.RiskTaskSelect;

export type TaskListRow = Prisma.RiskTaskGetPayload<{ select: typeof taskListSelect }>;

export async function namesForTasks(db: DbClient, rows: readonly TaskListRow[], extraUsers: (string | null | undefined)[] = []): Promise<NameMaps> {
  return loadNames(db, { users: [...rows.map((r) => r.ownerId), ...extraUsers], sites: rows.map((r) => r.siteId) });
}

export function toTaskListItem(r: TaskListRow, names: NameMaps, today: string): TaskListItem {
  const factor = r.assessment && r.factor ? findFactor(r.assessment.method as RiskMethod, r.assessment.domain, r.factor) : null;
  return {
    id: r.id,
    reference: r.reference,
    kind: r.kind,
    title: r.title,
    status: r.status,
    owner: { id: r.ownerId, name: names.users.get(r.ownerId) ?? "Unknown" },
    createdOn: dateOnly(r.createdOn)!,
    dueDate: dateOnly(r.dueDate)!,
    overdue: isTaskOverdue(r.status, dateOnly(r.dueDate)!, today),
    completedOn: dateOnly(r.completedOn),
    programme: r.programme,
    assessment: r.assessment ? { id: r.assessment.id, reference: r.assessment.reference, title: r.assessment.title } : null,
    hazard: r.hazard ? { id: r.hazard.id, name: r.hazard.name || "Untitled" } : null,
    parentId: r.parentId,
    parentReference: r.parent?.reference ?? null,
    subTaskCount: r.subTasks.length,
    openSubTasks: r.subTasks.filter((s) => s.status !== "COMPLETED").length,
    factor: r.factor,
    factorLabel: factor?.label ?? r.factor,
    originalValue: r.originalValue,
    targetValue: r.targetValue,
    actualValue: r.actualValue,
    siteName: r.siteId ? (names.sites.get(r.siteId) ?? null) : null,
  };
}

function orderBy(q: Pick<TaskListQuery, "sort" | "dir">): Prisma.RiskTaskOrderByWithRelationInput[] {
  const dir = q.dir;
  switch (q.sort) {
    case "reference":
      return [{ reference: dir }];
    case "status":
      return [{ status: dir }, { dueDate: "asc" }];
    case "createdOn":
      return [{ createdOn: dir }, { reference: "asc" }];
    case "updatedAt":
      return [{ updatedAt: dir }];
    default:
      return [{ dueDate: dir }, { reference: "asc" }];
  }
}

export function taskWhere(user: CurrentUser, q: Omit<TaskListQuery, "page" | "pageSize" | "sort" | "dir">): Prisma.RiskTaskWhereInput {
  const today = toDate(todayFor(user.timeZone));
  const and: Prisma.RiskTaskWhereInput[] = [taskVisibleWhere(user)];
  if (q.status === "ACTIVE") and.push({ status: { in: ["OPEN", "IN_PROGRESS"] } });
  else if (q.status) and.push({ status: q.status });
  if (q.kind) and.push({ kind: q.kind });
  if (q.siteId) and.push({ siteId: q.siteId });
  if (q.ownerId) and.push({ ownerId: q.ownerId });
  if (q.programmeId) and.push({ programmeId: q.programmeId });
  if (q.assessmentId) and.push({ assessmentId: q.assessmentId });
  if (q.overdue === "true") and.push({ status: { not: "COMPLETED" }, dueDate: { lt: today } });
  if (q.mine === "true") and.push({ ownerId: user.id });
  if (q.topLevel === "true") and.push({ parentId: null });
  if (q.q) and.push({ OR: [{ reference: { contains: q.q, mode: "insensitive" } }, { title: { contains: q.q, mode: "insensitive" } }] });
  return { AND: and };
}

export const taskQueryService = {
  async list(user: CurrentUser, q: TaskListQuery): Promise<Paginated<TaskListItem>> {
    const where = taskWhere(user, q);
    const [rows, total] = await Promise.all([
      prisma.riskTask.findMany({ where, select: taskListSelect, orderBy: orderBy(q), skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.riskTask.count({ where }),
    ]);
    const names = await namesForTasks(prisma, rows);
    const today = todayFor(user.timeZone);
    return { items: rows.map((r) => toTaskListItem(r, names, today)), total, page: q.page, pageSize: q.pageSize };
  },

  async detail(user: CurrentUser, id: string): Promise<TaskDetailDto> {
    const row = await prisma.riskTask.findFirst({
      where: { AND: [{ id }, taskVisibleWhere(user)] },
      select: {
        ...taskListSelect,
        version: true,
        info: true,
        completionComment: true,
        completedById: true,
        assessment: { select: { id: true, reference: true, title: true, method: true, domain: true, status: true } },
        parent: { select: { id: true, reference: true, title: true, status: true, subTasks: { select: { status: true } } } },
      },
    });
    if (!row) throw new NotFoundError();
    const subRows = await prisma.riskTask.findMany({ where: { parentId: id }, select: taskListSelect, orderBy: [{ dueDate: "asc" }, { reference: "asc" }] });
    const names = await namesForTasks(prisma, [row as unknown as TaskListRow, ...subRows], [row.completedById]);
    const today = todayFor(user.timeZone);
    const base = toTaskListItem(row as unknown as TaskListRow, names, today);
    const scoring = isScoringTask(row);
    const factor = row.assessment && row.factor ? findFactor(row.assessment.method as RiskMethod, row.assessment.domain, row.factor) : null;
    const facts = { ...placementOf(row), ownerId: row.ownerId };
    // Assessment link visible to the viewer? (otherwise only its reference is shown)
    const assessmentVisible = row.assessment ? Boolean(await prisma.riskAssessment.findFirst({ where: { AND: [{ id: row.assessment.id }, assessmentVisibleWhere(user)] }, select: { id: true } })) : false;
    return {
      ...base,
      assessment: row.assessment ? { id: assessmentVisible ? row.assessment.id : "", reference: row.assessment.reference, title: row.assessment.title } : null,
      version: row.version,
      info: row.info,
      completionComment: row.completionComment,
      completedByName: row.completedById ? (names.users.get(row.completedById) ?? null) : null,
      parent: row.parent ? { id: row.parent.id, reference: row.parent.reference, title: row.parent.title, status: row.parent.status } : null,
      subTasks: subRows.map((r) => toTaskListItem(r, names, today)),
      siblingProgress: row.parent ? { completed: row.parent.subTasks.filter((s) => s.status === "COMPLETED").length, total: row.parent.subTasks.length } : null,
      scoring,
      factorRange: factor ? { label: factor.label, min: factor.min, max: factor.max } : null,
      assessmentStatus: row.assessment?.status ?? null,
      assessmentMethod: (row.assessment?.method as RiskMethod | undefined) ?? null,
      today,
      permissions: {
        edit: row.status !== "COMPLETED" && canEditTask(user, facts),
        work: row.status !== "COMPLETED" && canWorkOnTask(user, facts),
        addSubTask: row.status !== "COMPLETED" && !row.parentId && canCreateTaskAt(user, facts),
      },
    };
  },
};
