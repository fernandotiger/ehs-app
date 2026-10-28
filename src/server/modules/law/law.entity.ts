import "server-only";
import { prisma } from "@/server/db/client";
import type { EntityDescriptor } from "@/server/modules/entities/types";
import { canEditProfile, canEvaluate, profileVisibleWhere, requirementVisibleWhere, taskRights, taskVisibleWhere } from "./law-access.policy";
import { placementOf, profileHref, requirementHref, taskHref } from "./support";

/** Law records in the entity registry (evidence, comments and record links / follow-up provenance). */

export const lawRequirementEntity: EntityDescriptor = {
  module: "law",
  async label(id) {
    const row = await prisma.lawRequirement.findUnique({ where: { id }, select: { reference: true, title: true, profile: { select: { name: true } } } });
    return row ? `${row.reference} · ${row.title} (${row.profile.name})` : null;
  },
  href: requirementHref,
  canView: async (user, id) => Boolean(await prisma.lawRequirement.findFirst({ where: { AND: [{ id }, requirementVisibleWhere(user)] }, select: { id: true } })),
  /** Evidence: whoever may evaluate the requirement (active profile, active requirement). */
  async canEdit(user, id) {
    const row = await prisma.lawRequirement.findFirst({
      where: { AND: [{ id }, { archivedAt: null }, { profile: { archivedAt: null } }, requirementVisibleWhere(user)] },
      select: { ownerId: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true, profile: { select: { ownerId: true } } },
    });
    return Boolean(row && canEvaluate(user, { ...placementOf(row), ownerId: row.ownerId, profileOwnerId: row.profile.ownerId }));
  },
};

export const lawTaskEntity: EntityDescriptor = {
  module: "law",
  async label(id) {
    const row = await prisma.lawTask.findUnique({ where: { id }, select: { reference: true, title: true } });
    return row ? `${row.reference} · ${row.title}` : null;
  },
  href: taskHref,
  canView: async (user, id) => Boolean(await prisma.lawTask.findFirst({ where: { AND: [{ id }, taskVisibleWhere(user)] }, select: { id: true } })),
  async canEdit(user, id) {
    const row = await prisma.lawTask.findFirst({
      where: { AND: [{ id }, taskVisibleWhere(user)] },
      select: { ownerId: true, createdById: true, status: true, archivedAt: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true },
    });
    if (!row) return false;
    const rights = taskRights(user, { ...placementOf(row), ownerId: row.ownerId, createdById: row.createdById, status: row.status, archived: Boolean(row.archivedAt) });
    return rights.work || rights.edit;
  },
};

export const lawProfileEntity: EntityDescriptor = {
  module: "law",
  async label(id) {
    const row = await prisma.lawProfile.findUnique({ where: { id }, select: { name: true } });
    return row ? `Legal profile · ${row.name}` : null;
  },
  href: profileHref,
  canView: async (user, id) => Boolean(await prisma.lawProfile.findFirst({ where: { AND: [{ id }, profileVisibleWhere(user)] }, select: { id: true } })),
  async canEdit(user, id) {
    const row = await prisma.lawProfile.findFirst({ where: { AND: [{ id }, { archivedAt: null }, profileVisibleWhere(user)] }, select: { ownerId: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true } });
    return Boolean(row && canEditProfile(user, { ...placementOf(row), ownerId: row.ownerId }));
  },
};
