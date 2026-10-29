import "server-only";
import { SLAW_REQUIREMENT_ENTITY, slawActionHref } from "@/lib/simplified-law";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { DueWorkItem, DueWorkProvider } from "@/server/modules/jobs/types";
import { dateOnly } from "./support";

/**
 * Due work for scheduled jobs and My work: open Simplified law actions (a requirement gap with an owner
 * and a due date) → the owner. The register is company-wide, so items carry no placement (company scope).
 */

const MAX_ITEMS = 5000;
const NO_PLACEMENT = { businessUnitId: null, siteId: null, locationId: null, departmentId: null };

async function items(userId?: string): Promise<DueWorkItem[]> {
  const rows = await prisma.slawRequirement.findMany({
    where: { actionStatus: "OPEN", actionDueDate: { not: null }, archivedAt: null, legislation: { archivedAt: null }, ...(userId ? { actionOwnerId: userId } : {}) },
    select: { id: true, actionText: true, actionDueDate: true, actionOwnerId: true, legislation: { select: { title: true, shortTitle: true } } },
    orderBy: { actionDueDate: "asc" },
    take: MAX_ITEMS,
  });
  return rows.map((r) => ({
    provider: "slaw.action" as const,
    entityType: SLAW_REQUIREMENT_ENTITY,
    entityId: r.id,
    reference: r.legislation.shortTitle || undefined,
    title: `${r.actionText} (${r.legislation.shortTitle || r.legislation.title})`,
    href: slawActionHref(r.id),
    dueDate: dateOnly(r.actionDueDate)!,
    ownerId: r.actionOwnerId,
    placement: NO_PLACEMENT,
  }));
}

export const slawActionProvider: DueWorkProvider = {
  kind: "slaw.action",
  module: "simplified-law",
  label: "Simplified law actions",
  jobTarget: true,
  listOpen: () => items(),
  listForUser: (user: CurrentUser) => items(user.id),
};
