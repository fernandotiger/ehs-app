import "server-only";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { DueWorkItem, DueWorkProvider } from "@/server/modules/jobs/types";
import { actionHref, ACTION_ENTITY, dateOnly, incidentHref, INCIDENT_ENTITY, TASK_ENTITY } from "./support";

/**
 * Due work for scheduled jobs and My work.
 *  - incident.investigation: submitted, not closed/archived incidents whose type uses investigations
 *    and whose investigation is not completed – one item per assigned investigator (due = target date).
 *  - incident.action: open/in-progress actions (owner + due date), actions awaiting effectiveness
 *    (reviewer + planned review date, J-06) and open child tasks (task owner + task due date).
 */

const MAX_ITEMS = 5000;

const placementOf = (r: { businessUnitId: string | null; siteId: string | null; locationId: string | null; departmentId: string | null }) => ({
  businessUnitId: r.businessUnitId,
  siteId: r.siteId,
  locationId: r.locationId,
  departmentId: r.departmentId,
});

async function investigationItems(userId?: string): Promise<DueWorkItem[]> {
  const rows = await prisma.incident.findMany({
    where: {
      isDraft: false,
      closedAt: null,
      archivedAt: null,
      investigationTargetDate: { not: null },
      type: { investigationEnabled: true },
      AND: [
        { OR: [{ investigation: { is: null } }, { investigation: { status: "IN_PROGRESS" } }] },
        userId ? { OR: [{ investigators: { some: { userId } } }, { investigation: { investigatorId: userId } }] } : {},
      ],
    },
    select: {
      id: true,
      reference: true,
      title: true,
      investigationTargetDate: true,
      businessUnitId: true,
      siteId: true,
      locationId: true,
      departmentId: true,
      investigators: { select: { userId: true } },
      investigation: { select: { investigatorId: true } },
    },
    orderBy: { investigationTargetDate: "asc" },
    take: MAX_ITEMS,
  });
  const items: DueWorkItem[] = [];
  for (const r of rows) {
    const owners = [...new Set([r.investigation?.investigatorId, ...r.investigators.map((i) => i.userId)].filter((v): v is string => Boolean(v)))];
    for (const ownerId of owners.length ? owners : [null]) {
      if (userId && ownerId !== userId) continue;
      items.push({
        provider: "incident.investigation",
        entityType: INCIDENT_ENTITY,
        entityId: r.id,
        reference: r.reference,
        title: `Investigate: ${r.title}`,
        href: incidentHref(r.id),
        dueDate: dateOnly(r.investigationTargetDate)!,
        ownerId,
        placement: placementOf(r),
      });
    }
  }
  return items;
}

async function actionItems(userId?: string): Promise<DueWorkItem[]> {
  const actions = await prisma.correctiveAction.findMany({
    where: {
      archivedAt: null,
      state: { in: ["OPEN", "IN_PROGRESS", "AWAITING_EFFECTIVENESS"] },
      ...(userId ? { OR: [{ ownerId: userId }, { reviewerId: userId }] } : {}),
    },
    select: {
      id: true,
      reference: true,
      description: true,
      state: true,
      ownerId: true,
      reviewerId: true,
      dueDate: true,
      plannedReviewDate: true,
      businessUnitId: true,
      siteId: true,
      locationId: true,
      departmentId: true,
    },
    orderBy: { dueDate: "asc" },
    take: MAX_ITEMS,
  });
  const items: DueWorkItem[] = [];
  for (const a of actions) {
    const review = a.state === "AWAITING_EFFECTIVENESS";
    if (review && !a.plannedReviewDate) continue;
    items.push({
      provider: "incident.action",
      entityType: ACTION_ENTITY,
      entityId: a.id,
      reference: a.reference,
      title: review ? `Review effectiveness: ${a.description}` : a.description,
      href: actionHref(a.id),
      dueDate: dateOnly(review ? a.plannedReviewDate : a.dueDate)!,
      ownerId: a.ownerId,
      placement: placementOf(a),
      ...(review ? { reviewerId: a.reviewerId } : {}),
    });
  }
  const tasks = await prisma.actionTask.findMany({
    where: { done: false, action: { archivedAt: null, state: { in: ["OPEN", "IN_PROGRESS"] } }, ...(userId ? { ownerId: userId } : {}) },
    select: { id: true, title: true, ownerId: true, dueDate: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true, action: { select: { id: true, reference: true } } },
    orderBy: { dueDate: "asc" },
    take: MAX_ITEMS,
  });
  for (const t of tasks) {
    items.push({
      provider: "incident.action",
      entityType: TASK_ENTITY,
      entityId: t.id,
      reference: t.action.reference,
      title: `Task: ${t.title}`,
      href: actionHref(t.action.id),
      dueDate: dateOnly(t.dueDate)!,
      ownerId: t.ownerId,
      placement: placementOf(t),
    });
  }
  return items.slice(0, MAX_ITEMS);
}

export const incidentInvestigationProvider: DueWorkProvider = {
  kind: "incident.investigation",
  module: "incidents",
  label: "Incident investigations",
  jobTarget: true,
  listOpen: () => investigationItems(),
  listForUser: (user: CurrentUser) => investigationItems(user.id),
};

export const incidentActionProvider: DueWorkProvider = {
  kind: "incident.action",
  module: "incidents",
  label: "Incident actions",
  jobTarget: true,
  listOpen: () => actionItems(),
  listForUser: (user: CurrentUser) => actionItems(user.id),
};
