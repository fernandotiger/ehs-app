import "server-only";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { DueWorkItem, DueWorkProvider } from "@/server/modules/jobs/types";
import { rowInScope } from "./requirement-sync";
import { dateOnly, findVersion, loadVersions, placementOf, REQUIREMENT_ENTITY, requirementHref, TASK_ENTITY, taskHref } from "./support";

/**
 * Due work for scheduled jobs and My work:
 *  - `law.evaluation`: relevant requirements of active profiles that apply under the profile's
 *    accepted content and have a next review date → the responsible owner (the profile owner when
 *    nobody is chosen yet), due = next review date. Reminders never change the evaluation.
 *  - `law.task`: open Law tasks → the task owner, due = due date.
 */

const MAX_ITEMS = 5000;

async function evaluationItems(userId?: string): Promise<DueWorkItem[]> {
  const rows = await prisma.lawRequirement.findMany({
    where: {
      isRelevant: true,
      archivedAt: null,
      nextReviewDate: { not: null },
      profile: { archivedAt: null },
      ...(userId ? { OR: [{ ownerId: userId }, { ownerId: null, profile: { ownerId: userId } }] } : {}),
    },
    select: {
      id: true,
      reference: true,
      title: true,
      kind: true,
      contentKey: true,
      archivedAt: true,
      ownerId: true,
      nextReviewDate: true,
      businessUnitId: true,
      siteId: true,
      locationId: true,
      departmentId: true,
      profile: { select: { ownerId: true, jurisdiction: true, activities: true, contentVersion: true } },
    },
    orderBy: { nextReviewDate: "asc" },
    take: MAX_ITEMS,
  });
  if (!rows.length) return [];
  const versions = await loadVersions(prisma);
  return rows
    .filter((r) => rowInScope(r, r.profile, findVersion(versions, r.profile.contentVersion)?.content ?? { legislation: [], checklists: [] }))
    .map((r) => ({
      provider: "law.evaluation" as const,
      entityType: REQUIREMENT_ENTITY,
      entityId: r.id,
      reference: r.reference,
      title: `Review: ${r.title}`,
      href: requirementHref(r.id),
      dueDate: dateOnly(r.nextReviewDate)!,
      ownerId: r.ownerId ?? r.profile.ownerId,
      placement: placementOf(r),
    }));
}

async function taskItems(userId?: string): Promise<DueWorkItem[]> {
  const rows = await prisma.lawTask.findMany({
    where: { status: "OPEN", archivedAt: null, ...(userId ? { ownerId: userId } : {}) },
    select: { id: true, reference: true, title: true, dueDate: true, ownerId: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true },
    orderBy: { dueDate: "asc" },
    take: MAX_ITEMS,
  });
  return rows.map((t) => ({
    provider: "law.task" as const,
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

export const lawEvaluationProvider: DueWorkProvider = {
  kind: "law.evaluation",
  module: "law",
  label: "Law evaluation reviews",
  jobTarget: true,
  listOpen: () => evaluationItems(),
  listForUser: (user: CurrentUser) => evaluationItems(user.id),
};

export const lawTaskProvider: DueWorkProvider = {
  kind: "law.task",
  module: "law",
  label: "Law tasks",
  jobTarget: true,
  listOpen: () => taskItems(),
  listForUser: (user: CurrentUser) => taskItems(user.id),
};
