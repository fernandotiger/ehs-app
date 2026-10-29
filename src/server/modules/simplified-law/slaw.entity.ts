import "server-only";
import { slawActionHref, slawLegislationHref } from "@/lib/simplified-law";
import { prisma } from "@/server/db/client";
import type { EntityDescriptor } from "@/server/modules/entities/types";
import { actionVisibleWhere, canAssess, canCompleteAction, canViewRegister } from "./slaw-access.policy";

/** Simplified law records in the entity registry (evidence on requirements, labels and links). */

export const slawLegislationEntity: EntityDescriptor = {
  module: "simplified-law",
  async label(id) {
    const row = await prisma.slawLegislation.findUnique({ where: { id }, select: { title: true, reference: true } });
    return row ? [row.reference, row.title].filter(Boolean).join(" · ") : null;
  },
  href: (id) => slawLegislationHref(id),
  canView: async (user, id) => canViewRegister(user) && Boolean(await prisma.slawLegislation.findFirst({ where: { id, archivedAt: null }, select: { id: true } })),
  canEdit: async (user, id) => canAssess(user) && Boolean(await prisma.slawLegislation.findFirst({ where: { id, archivedAt: null }, select: { id: true } })),
};

/** Evidence ("reason compliant") lives on the requirement row; its action owner may add proof too. */
export const slawRequirementEntity: EntityDescriptor = {
  module: "simplified-law",
  async label(id) {
    const row = await prisma.slawRequirement.findUnique({ where: { id }, select: { text: true, legislation: { select: { title: true, shortTitle: true } } } });
    return row ? `${row.legislation.shortTitle || row.legislation.title} · ${row.text.length > 80 ? `${row.text.slice(0, 80)}…` : row.text}` : null;
  },
  href: (id) => slawActionHref(id),
  async canView(user, id) {
    const live = { id, archivedAt: null, legislation: { archivedAt: null } };
    if (canViewRegister(user)) return Boolean(await prisma.slawRequirement.findFirst({ where: live, select: { id: true } }));
    return Boolean(await prisma.slawRequirement.findFirst({ where: { AND: [live, actionVisibleWhere(user)] }, select: { id: true } }));
  },
  async canEdit(user, id) {
    const row = await prisma.slawRequirement.findFirst({ where: { id, archivedAt: null, legislation: { archivedAt: null, status: { not: "REPEALED" } } }, select: { actionStatus: true, actionOwnerId: true } });
    if (!row) return false;
    return canAssess(user) || canCompleteAction(user, row);
  },
};
