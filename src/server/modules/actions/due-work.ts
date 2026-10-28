import "server-only";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { DueWorkItem, DueWorkProvider } from "@/server/modules/jobs/types";
import { ACTION_ENTITY, actionHref, dateOnly, placementOf } from "./support";

/**
 * Due work for scheduled jobs and My work: open standalone actions (To do / In progress) → the
 * owner, due = the action's due date. Scheduled jobs (Configuration → Scheduled jobs) can target
 * "Actions" for overdue / upcoming reminders and digests; overdue.ts sends the one-off overdue notice.
 */

const MAX_ITEMS = 5000;

async function items(userId?: string): Promise<DueWorkItem[]> {
  const rows = await prisma.action.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] }, archivedAt: null, ...(userId ? { ownerId: userId } : {}) },
    select: { id: true, reference: true, title: true, dueDate: true, ownerId: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true },
    orderBy: { dueDate: "asc" },
    take: MAX_ITEMS,
  });
  return rows.map((a) => ({
    provider: "action" as const,
    entityType: ACTION_ENTITY,
    entityId: a.id,
    reference: a.reference,
    title: a.title,
    href: actionHref(a.id),
    dueDate: dateOnly(a.dueDate)!,
    ownerId: a.ownerId,
    placement: placementOf(a),
  }));
}

export const actionProvider: DueWorkProvider = {
  kind: "action",
  module: "actions",
  label: "Actions",
  jobTarget: true,
  listOpen: () => items(),
  listForUser: (user: CurrentUser) => items(user.id),
};
