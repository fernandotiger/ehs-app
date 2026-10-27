import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ACTION_KIND_LABELS, ACTION_STATE_LABELS, PRIORITY_LABELS, type ActionStateKey } from "@/lib/incidents";
import { paginate, type Paginated } from "@/lib/validation/common";
import type { ActionListQuery } from "@/lib/validation/incidents";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import type { CsvValue } from "@/server/modules/documents/csv";
import { actionFacts } from "./action.service";
import { actionVisibleWhere, canCompleteTask, canEditAction, canReviewAction, canWorkOnAction } from "./incident-access.policy";
import { actionSummarySelect, toActionSummary, toNode } from "./incident-query.service";
import type { ActionDetailDto, ActionSummaryDto, FollowUpNode, TaskDto, TaskListItem, TrendSnapshotDto } from "./incident.dto";
import { csvName, csvResponse, dateOnly, iso, loadNames, ref, todayFor, toDate } from "./support";
import { actionCompletionBlockers, actionReviewBlockers, followUpBlockers, isActionResolved, type ActionNode } from "./workflow";

/** Read side of actions and tasks: registers (Actions · Tasks tabs), detail with follow-up tree, CSV. */

function actionListWhere(user: CurrentUser, q: Omit<ActionListQuery, "page" | "pageSize">): Prisma.CorrectiveActionWhereInput {
  const today = toDate(todayFor(user.timeZone));
  const and: Prisma.CorrectiveActionWhereInput[] = [actionVisibleWhere(user), { archivedAt: null }];
  if (q.state === "ACTIVE") and.push({ state: { in: ["OPEN", "IN_PROGRESS", "AWAITING_EFFECTIVENESS"] } });
  else if (q.state) and.push({ state: q.state });
  if (q.kind) and.push({ kind: q.kind });
  if (q.siteId) and.push({ siteId: q.siteId });
  if (q.ownerId) and.push({ ownerId: q.ownerId });
  if (q.mine === "true") and.push({ OR: [{ ownerId: user.id }, { reviewerId: user.id }] });
  if (q.excludeIncidentId) and.push({ incidents: { none: { incidentId: q.excludeIncidentId } }, state: { in: ["OPEN", "IN_PROGRESS", "AWAITING_EFFECTIVENESS"] } });
  if (q.overdue === "true") {
    and.push({ OR: [{ state: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: today } }, { state: "AWAITING_EFFECTIVENESS", plannedReviewDate: { lt: today } }] });
  }
  if (q.q) {
    const contains = { contains: q.q, mode: "insensitive" as const };
    and.push({ OR: [{ reference: contains }, { description: contains }, { incidents: { some: { incident: { reference: contains } } } }] });
  }
  return { AND: and };
}

function actionOrder(q: Pick<ActionListQuery, "sort" | "dir">): Prisma.CorrectiveActionOrderByWithRelationInput[] {
  switch (q.sort) {
    case "reference":
      return [{ reference: q.dir }];
    case "state":
      return [{ state: q.dir }, { dueDate: "asc" }];
    case "priority":
      return [{ priority: q.dir }, { dueDate: "asc" }];
    case "updatedAt":
      return [{ updatedAt: q.dir }];
    default:
      return [{ dueDate: q.dir }, { reference: "asc" }];
  }
}

function taskListWhere(user: CurrentUser, q: Omit<ActionListQuery, "page" | "pageSize">): Prisma.ActionTaskWhereInput {
  const today = toDate(todayFor(user.timeZone));
  const and: Prisma.ActionTaskWhereInput[] = [{ OR: [{ ownerId: user.id }, { action: actionVisibleWhere(user) }] }, { action: { archivedAt: null } }];
  if (q.done === "true") and.push({ done: true });
  else if (q.done === "false") and.push({ done: false });
  if (q.siteId) and.push({ siteId: q.siteId });
  if (q.ownerId) and.push({ ownerId: q.ownerId });
  if (q.mine === "true") and.push({ ownerId: user.id });
  if (q.overdue === "true") and.push({ done: false, dueDate: { lt: today } });
  if (q.q) {
    const contains = { contains: q.q, mode: "insensitive" as const };
    and.push({ OR: [{ title: contains }, { action: { reference: contains } }] });
  }
  return { AND: and };
}

/** Graph of an action and all its follow-up descendants (for resolution and the tree). */
async function descendants(db: DbClient, rootIds: string[]) {
  const all: { id: string; reference: string; description: string; state: ActionStateKey; parentActionId: string | null; incidents: { incidentId: string }[] }[] = [];
  let frontier = rootIds;
  const seen = new Set(rootIds);
  for (let depth = 0; depth < 20 && frontier.length; depth++) {
    const rows = await db.correctiveAction.findMany({
      where: { parentActionId: { in: frontier }, archivedAt: null },
      select: { id: true, reference: true, description: true, state: true, parentActionId: true, incidents: { select: { incidentId: true } } },
      orderBy: { createdAt: "asc" },
    });
    frontier = [];
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      all.push(r);
      frontier.push(r.id);
    }
  }
  return all;
}

export async function actionGraph(db: DbClient, root: ActionNode): Promise<ActionNode[]> {
  const rows = await descendants(db, [root.id]);
  return [root, ...rows.map(toNode)];
}

function taskDto(
  t: { id: string; actionId: string; title: string; ownerId: string; departmentId: string | null; dueDate: Date; priority: TaskDto["priority"]; done: boolean; completionComment: string | null; completedAt: Date | null; completedById: string | null; owner: { id: string; name: string } },
  names: Awaited<ReturnType<typeof loadNames>>,
  today: string,
  rights: { canComplete: boolean; canEdit: boolean },
): TaskDto {
  const dueDate = dateOnly(t.dueDate)!;
  return {
    id: t.id,
    actionId: t.actionId,
    title: t.title,
    owner: t.owner,
    departmentId: t.departmentId,
    departmentName: t.departmentId ? (names.departments.get(t.departmentId) ?? null) : null,
    dueDate,
    priority: t.priority,
    done: t.done,
    completionComment: t.completionComment,
    completedAt: iso(t.completedAt),
    completedBy: ref(names.users, t.completedById),
    overdue: !t.done && dueDate < today,
    canComplete: rights.canComplete,
    canEdit: rights.canEdit,
  };
}

export const actionQueryService = {
  async list(user: CurrentUser, q: ActionListQuery): Promise<Paginated<ActionSummaryDto>> {
    const where = actionListWhere(user, q);
    const [rows, total] = await Promise.all([
      prisma.correctiveAction.findMany({ where, select: actionSummarySelect, orderBy: actionOrder(q), ...paginate(q) }),
      prisma.correctiveAction.count({ where }),
    ]);
    const names = await loadNames(prisma, { sites: rows.map((r) => r.siteId), departments: rows.map((r) => r.departmentId) });
    const today = todayFor(user.timeZone);
    const ineffective = rows.filter((r) => r.state === "INEFFECTIVE");
    const extra = ineffective.length ? (await descendants(prisma, ineffective.map((r) => r.id))).map(toNode) : [];
    const graph = [...rows.map(toNode), ...extra];
    return { items: rows.map((r) => toActionSummary(r, graph, today, names)), total, page: q.page, pageSize: q.pageSize };
  },

  async tasks(user: CurrentUser, q: ActionListQuery): Promise<Paginated<TaskListItem>> {
    const where = taskListWhere(user, q);
    const [rows, total] = await Promise.all([
      prisma.actionTask.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true } },
          action: { select: { id: true, reference: true, description: true, state: true, ownerId: true, reviewerId: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true } },
        },
        orderBy: q.sort === "reference" ? [{ action: { reference: q.dir } }] : [{ done: "asc" }, { dueDate: q.dir }],
        ...paginate(q),
      }),
      prisma.actionTask.count({ where }),
    ]);
    const names = await loadNames(prisma, { users: rows.map((r) => r.completedById), sites: rows.map((r) => r.siteId), departments: rows.map((r) => r.departmentId) });
    const today = todayFor(user.timeZone);
    return {
      items: rows.map((t) => {
        const facts = actionFacts(t.action);
        const open = t.action.state === "OPEN" || t.action.state === "IN_PROGRESS";
        return {
          ...taskDto(t, names, today, { canComplete: !t.done && canCompleteTask(user, facts, t), canEdit: open && !t.done && (canEditAction(user, facts) || canWorkOnAction(user, facts)) }),
          action: { id: t.action.id, reference: t.action.reference, description: t.action.description, state: t.action.state },
          siteName: t.siteId ? (names.sites.get(t.siteId) ?? null) : null,
        };
      }),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  },

  async detail(user: CurrentUser, id: string): Promise<ActionDetailDto> {
    const row = await prisma.correctiveAction.findFirst({
      where: { AND: [{ id }, actionVisibleWhere(user)] },
      select: {
        ...actionSummarySelect,
        version: true,
        capaCategory: true,
        businessUnitId: true,
        locationId: true,
        ownerId: true,
        reviewerId: true,
        completionComment: true,
        completedAt: true,
        completedById: true,
        reviewComment: true,
        reviewedAt: true,
        reviewedById: true,
        trend: true,
        createdById: true,
        createdAt: true,
        parent: { select: { id: true, reference: true, description: true, state: true } },
        incidents: { select: { incidentId: true, incident: { select: { id: true, reference: true, title: true, status: true } } }, orderBy: { linkedAt: "asc" } },
        tasks: { include: { owner: { select: { id: true, name: true } } }, orderBy: { sortOrder: "asc" } },
      },
    });
    if (!row) throw new NotFoundError();
    const today = todayFor(user.timeZone);
    const desc = await descendants(prisma, [row.id]);
    const graph: ActionNode[] = [toNode(row), ...desc.map(toNode)];
    const names = await loadNames(prisma, {
      users: [row.completedById, row.reviewedById, row.createdById, ...row.tasks.map((t) => t.completedById)],
      sites: [row.siteId],
      locations: [row.locationId],
      departments: [row.departmentId, ...row.tasks.map((t) => t.departmentId)],
    });
    const facts = actionFacts(row);
    const open = row.state === "OPEN" || row.state === "IN_PROGRESS";
    const canEdit = canEditAction(user, facts);
    const canWork = canWorkOnAction(user, facts);
    const canReview = canReviewAction(user, facts);
    const plannedReviewDate = dateOnly(row.plannedReviewDate);

    const tree = (parentId: string): FollowUpNode[] =>
      desc
        .filter((d) => d.parentActionId === parentId)
        .map((d) => ({ id: d.id, reference: d.reference, description: d.description, state: d.state, resolved: isActionResolved(toNode(d), graph), children: tree(d.id) }));

    const summary = toActionSummary(row, graph, today, names);
    return {
      ...summary,
      version: row.version,
      capaCategory: row.capaCategory,
      placement: {
        businessUnitId: row.businessUnitId,
        siteId: row.siteId,
        locationId: row.locationId,
        departmentId: row.departmentId,
        siteName: summary.siteName,
        locationName: row.locationId ? (names.locations.get(row.locationId) ?? null) : null,
        departmentName: summary.departmentName,
      },
      completionComment: row.completionComment,
      completedAt: iso(row.completedAt),
      completedBy: ref(names.users, row.completedById),
      reviewComment: row.reviewComment,
      reviewedAt: iso(row.reviewedAt),
      reviewedBy: ref(names.users, row.reviewedById),
      trend: (row.trend as TrendSnapshotDto | null) ?? null,
      incidents: row.incidents.map((i) => i.incident),
      tasks: row.tasks.map((t) =>
        taskDto(t, names, today, { canComplete: !t.done && canCompleteTask(user, facts, t), canEdit: open && !t.done && (canEdit || canWork) }),
      ),
      parent: row.parent,
      followUps: tree(row.id),
      createdBy: ref(names.users, row.createdById),
      createdAt: row.createdAt.toISOString(),
      today,
      completionBlockers: open
        ? actionCompletionBlockers({ state: row.state, tasks: row.tasks, completionComment: "x", reviewerId: row.reviewerId ?? "pending", plannedReviewDate: plannedReviewDate ?? "pending" })
        : [],
      reviewBlockers: row.state === "AWAITING_EFFECTIVENESS" ? actionReviewBlockers({ state: row.state, plannedReviewDate, today, comment: "x" }) : [],
      permissions: {
        edit: canEdit && row.state !== "EFFECTIVE" && row.state !== "INEFFECTIVE",
        work: canWork && open,
        review: canReview && row.state === "AWAITING_EFFECTIVENESS",
        followUp: (canEdit || canReview || canWork) && followUpBlockers(row.state).length === 0,
        link: (canEdit || canWork) && row.state !== "EFFECTIVE" && row.state !== "INEFFECTIVE",
        addTask: (canEdit || canWork) && open,
      },
    };
  },

  async exportCsv(user: CurrentUser, q: Omit<ActionListQuery, "page" | "pageSize">): Promise<Response> {
    const rows = await prisma.correctiveAction.findMany({
      where: actionListWhere(user, q),
      select: { ...actionSummarySelect, capaCategory: true, completionComment: true, reviewComment: true, incidents: { select: { incidentId: true, incident: { select: { reference: true } } } } },
      orderBy: actionOrder(q),
      take: 10_000,
    });
    const names = await loadNames(prisma, { sites: rows.map((r) => r.siteId), departments: rows.map((r) => r.departmentId) });
    const out: CsvValue[][] = [
      ["Reference", "Description", "Kind", "State", "Owner", "Site", "Department", "Due", "Priority", "Category", "Reviewer", "Review date", "Tasks done", "Incidents", "Origin", "Completion comment", "Review comment"],
    ];
    for (const r of rows) {
      out.push([
        r.reference,
        r.description,
        ACTION_KIND_LABELS[r.kind],
        ACTION_STATE_LABELS[r.state],
        r.owner.name,
        r.siteId ? (names.sites.get(r.siteId) ?? "") : "",
        r.departmentId ? (names.departments.get(r.departmentId) ?? "") : "",
        dateOnly(r.dueDate),
        PRIORITY_LABELS[r.priority],
        r.capaCategory ?? "",
        r.reviewer?.name ?? "",
        dateOnly(r.plannedReviewDate) ?? "",
        `${r.tasks.filter((t) => t.done).length}/${r.tasks.length}`,
        r.incidents.map((i) => i.incident.reference).join("; "),
        r.sourceLabel ?? "",
        r.completionComment ?? "",
        r.reviewComment ?? "",
      ]);
    }
    return csvResponse(csvName("incident-actions"), out);
  },
};
