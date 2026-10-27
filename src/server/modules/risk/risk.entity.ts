import "server-only";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { EntityDescriptor } from "@/server/modules/entities/types";
import { assessmentFacts } from "./assessment.service";
import {
  assessmentVisibleWhere,
  canEditAssessment,
  canEditStrategy,
  canEditTask,
  canWorkOnTask,
  objectiveVisibleWhere,
  programmeVisibleWhere,
  taskVisibleWhere,
} from "./risk-access.policy";
import { assessmentHref, objectiveHref, placementOf, programmeHref, taskHref } from "./support";

/** Risk records in the entity registry (evidence, comments and record links). */

const assessmentSelect = { id: true, status: true, ownerId: true, approverId: true, createdById: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true } as const;

async function visibleAssessment(user: CurrentUser, id: string) {
  return prisma.riskAssessment.findFirst({ where: { AND: [{ id }, assessmentVisibleWhere(user)] }, select: assessmentSelect });
}

export const riskAssessmentEntity: EntityDescriptor = {
  module: "risk",
  async label(id) {
    const row = await prisma.riskAssessment.findUnique({ where: { id }, select: { reference: true, title: true } });
    return row ? `${row.reference} · ${row.title || "Untitled"}` : null;
  },
  href: assessmentHref,
  canView: async (user, id) => Boolean(await visibleAssessment(user, id)),
  /** Evidence and links: editors at the placement or the responsible owner, while not archived. */
  async canEdit(user, id) {
    const row = await visibleAssessment(user, id);
    if (!row || row.status === "ARCHIVED") return false;
    return row.ownerId === user.id || canEditAssessment(user, { ...assessmentFacts(row), status: "DRAFT" });
  },
};

const taskSelect = { id: true, ownerId: true, status: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true } as const;

export const riskTaskEntity: EntityDescriptor = {
  module: "risk",
  async label(id) {
    const row = await prisma.riskTask.findUnique({ where: { id }, select: { reference: true, title: true } });
    return row ? `${row.reference} · ${row.title}` : null;
  },
  href: taskHref,
  canView: async (user, id) => Boolean(await prisma.riskTask.findFirst({ where: { AND: [{ id }, taskVisibleWhere(user)] }, select: { id: true } })),
  async canEdit(user, id) {
    const row = await prisma.riskTask.findFirst({ where: { AND: [{ id }, taskVisibleWhere(user)] }, select: taskSelect });
    if (!row) return false;
    const facts = { ...placementOf(row), ownerId: row.ownerId };
    return canWorkOnTask(user, facts) || canEditTask(user, facts);
  },
};

export const riskProgrammeEntity: EntityDescriptor = {
  module: "risk",
  async label(id) {
    const row = await prisma.riskProgramme.findUnique({ where: { id }, select: { title: true } });
    return row ? `Programme · ${row.title}` : null;
  },
  href: programmeHref,
  canView: async (user, id) => Boolean(await prisma.riskProgramme.findFirst({ where: { AND: [{ id }, programmeVisibleWhere(user)] }, select: { id: true } })),
  async canEdit(user, id) {
    const row = await prisma.riskProgramme.findFirst({ where: { AND: [{ id }, programmeVisibleWhere(user)] }, select: { ownerId: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true } });
    return Boolean(row && canEditStrategy(user, row));
  },
};

export const riskObjectiveEntity: EntityDescriptor = {
  module: "risk",
  async label(id) {
    const row = await prisma.riskObjective.findUnique({ where: { id }, select: { title: true } });
    return row ? `Objective · ${row.title}` : null;
  },
  href: objectiveHref,
  canView: async (user, id) => Boolean(await prisma.riskObjective.findFirst({ where: { AND: [{ id }, objectiveVisibleWhere(user)] }, select: { id: true } })),
  async canEdit(user, id) {
    const row = await prisma.riskObjective.findFirst({ where: { AND: [{ id }, objectiveVisibleWhere(user)] }, select: { ownerId: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true } });
    return Boolean(row && canEditStrategy(user, row));
  },
};
