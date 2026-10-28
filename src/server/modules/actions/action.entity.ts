import "server-only";
import { prisma } from "@/server/db/client";
import type { EntityDescriptor } from "@/server/modules/entities/types";
import { actionRights, actionVisibleWhere } from "./action-access.policy";
import { actionHref, placementOf } from "./support";

/** Standalone actions in the entity registry (evidence, comments and record links). */

const select = { id: true, ownerId: true, createdById: true, status: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true } as const;

export const actionEntity: EntityDescriptor = {
  module: "actions",
  async label(id) {
    const row = await prisma.action.findUnique({ where: { id }, select: { reference: true, title: true } });
    return row ? `${row.reference} · ${row.title}` : null;
  },
  href: actionHref,
  canView: async (user, id) => Boolean(await prisma.action.findFirst({ where: { AND: [{ id }, { archivedAt: null }, actionVisibleWhere(user)] }, select: { id: true } })),
  /** Evidence: whoever may work on or edit the open action. */
  async canEdit(user, id) {
    const row = await prisma.action.findFirst({ where: { AND: [{ id }, { archivedAt: null }, actionVisibleWhere(user)] }, select });
    if (!row) return false;
    const rights = actionRights(user, { ...placementOf(row), ownerId: row.ownerId, createdById: row.createdById, status: row.status });
    return rights.work || rights.edit;
  },
};
