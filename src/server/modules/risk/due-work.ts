import "server-only";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { DueWorkItem, DueWorkProvider } from "@/server/modules/jobs/types";
import { ASSESSMENT_ENTITY, assessmentHref, dateOnly, placementOf, TASK_ENTITY, taskHref } from "./support";

/**
 * Due work for scheduled jobs and My work.
 *  - risk.review: Approved assessments with a review date → the responsible owner (due = review date).
 *  - risk.task: Open / In-progress risk tasks (sub-tasks included) → the task owner (due = due date).
 * Reminders never rescore anything.
 */

const MAX_ITEMS = 5000;

async function reviewItems(userId?: string): Promise<DueWorkItem[]> {
  const rows = await prisma.riskAssessment.findMany({
    where: { status: "APPROVED", reviewDate: { not: null }, ...(userId ? { ownerId: userId } : {}) },
    select: { id: true, reference: true, title: true, reviewDate: true, ownerId: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true },
    orderBy: { reviewDate: "asc" },
    take: MAX_ITEMS,
  });
  return rows.map((r) => ({
    provider: "risk.review" as const,
    entityType: ASSESSMENT_ENTITY,
    entityId: r.id,
    reference: r.reference,
    title: `Periodic review: ${r.title}`,
    href: `${assessmentHref(r.id)}?review=1`,
    dueDate: dateOnly(r.reviewDate)!,
    ownerId: r.ownerId,
    placement: placementOf(r),
  }));
}

async function taskItems(userId?: string): Promise<DueWorkItem[]> {
  const rows = await prisma.riskTask.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] }, ...(userId ? { ownerId: userId } : {}) },
    select: { id: true, reference: true, title: true, dueDate: true, ownerId: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true },
    orderBy: { dueDate: "asc" },
    take: MAX_ITEMS,
  });
  return rows.map((t) => ({
    provider: "risk.task" as const,
    entityType: TASK_ENTITY,
    entityId: t.id,
    reference: t.reference,
    title: t.title,
    href: taskHref(t.id),
    dueDate: dateOnly(t.dueDate)!,
    ownerId: t.ownerId,
    placement: placementOf(t),
  }));
}

export const riskReviewProvider: DueWorkProvider = {
  kind: "risk.review",
  module: "risk",
  label: "Risk reviews",
  jobTarget: true,
  listOpen: () => reviewItems(),
  listForUser: (user: CurrentUser) => reviewItems(user.id),
};

export const riskTaskProvider: DueWorkProvider = {
  kind: "risk.task",
  module: "risk",
  label: "Risk tasks",
  jobTarget: true,
  listOpen: () => taskItems(),
  listForUser: (user: CurrentUser) => taskItems(user.id),
};
