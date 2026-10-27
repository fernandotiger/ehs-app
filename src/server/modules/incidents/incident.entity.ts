import "server-only";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { EntityDescriptor } from "@/server/modules/entities/types";
import { actionFacts } from "./action.service";
import {
  actionVisibleWhere,
  canCompleteTask,
  canEditAction,
  canEditReport,
  canInvestigate,
  canReviewAction,
  canWorkOnAction,
  incidentVisibleWhere,
} from "./incident-access.policy";
import { recordFacts } from "./incident.service";
import { actionHref, incidentHref } from "./support";

/** Incident records in the entity registry (evidence, comments and record links). */

const incidentSelect = {
  id: true,
  reference: true,
  title: true,
  reporterId: true,
  isDraft: true,
  isConfidential: true,
  closedAt: true,
  archivedAt: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
  investigators: { select: { userId: true } },
  type: { select: { attachmentsAllowed: true } },
} as const;

async function visibleIncident(user: CurrentUser, id: string) {
  return prisma.incident.findFirst({ where: { AND: [{ id }, incidentVisibleWhere(user)] }, select: incidentSelect });
}

export const incidentEntity: EntityDescriptor = {
  module: "incidents",
  async label(id) {
    const row = await prisma.incident.findUnique({ where: { id }, select: { reference: true, title: true } });
    return row ? `${row.reference} · ${row.title || "Untitled"}` : null;
  },
  href: incidentHref,
  canView: async (user, id) => Boolean(await visibleIncident(user, id)),
  async canEdit(user, id) {
    const row = await visibleIncident(user, id);
    if (!row || !row.type.attachmentsAllowed) return false;
    const facts = recordFacts(row);
    if (facts.closed || facts.archived) return false;
    return canEditReport(user, facts) || canInvestigate(user, facts) || row.reporterId === user.id;
  },
};

/** Investigation evidence (entity id = investigation id); editable only while In progress. */
export const investigationEntity: EntityDescriptor = {
  module: "incidents",
  async label(id) {
    const row = await prisma.investigation.findUnique({ where: { id }, select: { incident: { select: { reference: true } } } });
    return row ? `${row.incident.reference} · Investigation` : null;
  },
  href: (id) => `/incidents/investigation/${id}`,
  async canView(user, id) {
    const row = await prisma.investigation.findUnique({ where: { id }, select: { incidentId: true } });
    return Boolean(row && (await visibleIncident(user, row.incidentId)));
  },
  async canEdit(user, id) {
    const row = await prisma.investigation.findUnique({ where: { id }, select: { incidentId: true, status: true } });
    if (!row || row.status !== "IN_PROGRESS") return false;
    const incident = await visibleIncident(user, row.incidentId);
    return Boolean(incident && !incident.closedAt && canInvestigate(user, recordFacts(incident)));
  },
};

const actionSelect = { id: true, reference: true, description: true, ownerId: true, reviewerId: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true } as const;

async function visibleAction(user: CurrentUser, id: string) {
  return prisma.correctiveAction.findFirst({ where: { AND: [{ id }, actionVisibleWhere(user)] }, select: actionSelect });
}

export const correctiveActionEntity: EntityDescriptor = {
  module: "incidents",
  async label(id) {
    const row = await prisma.correctiveAction.findUnique({ where: { id }, select: { reference: true, description: true } });
    return row ? `${row.reference} · ${row.description}` : null;
  },
  href: actionHref,
  canView: async (user, id) => Boolean(await visibleAction(user, id)),
  async canEdit(user, id) {
    const row = await visibleAction(user, id);
    if (!row) return false;
    const facts = actionFacts(row);
    return canEditAction(user, facts) || canWorkOnAction(user, facts) || canReviewAction(user, facts);
  },
};

/** Child-task evidence (entity id = task id). */
export const actionTaskEntity: EntityDescriptor = {
  module: "incidents",
  async label(id) {
    const row = await prisma.actionTask.findUnique({ where: { id }, select: { title: true, action: { select: { reference: true } } } });
    return row ? `${row.action.reference} · ${row.title}` : null;
  },
  href: (id) => `/incidents/actions/task/${id}`,
  async canView(user, id) {
    const task = await prisma.actionTask.findUnique({ where: { id }, select: { actionId: true, ownerId: true } });
    if (!task) return false;
    return task.ownerId === user.id || Boolean(await visibleAction(user, task.actionId));
  },
  async canEdit(user, id) {
    const task = await prisma.actionTask.findUnique({ where: { id }, select: { actionId: true, ownerId: true, action: { select: actionSelect } } });
    if (!task) return false;
    return canCompleteTask(user, actionFacts(task.action), task) || canEditAction(user, actionFacts(task.action));
  },
};
