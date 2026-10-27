import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ACTION_STATE_LABELS, type ActionKindKey, type PriorityKey } from "@/lib/incidents";
import type { ActionCreateInput, ActionUpdateInput, FollowUpCreateInput, TaskInput } from "@/lib/validation/incidents";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ForbiddenError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { numberingService } from "@/server/modules/numbering/numbering.service";
import { resolvePlacement, type ResolvedPlacement } from "@/server/modules/organisation/placement";
import { requireTenantId } from "@/server/tenancy/context";
import {
  actionVisibleWhere,
  canCompleteTask,
  canEditAction,
  canRaiseAction,
  canReviewAction,
  canWorkOnAction,
  incidentVisibleWhere,
  type ActionRecordFacts,
} from "./incident-access.policy";
import { listLabel } from "./incident-lookups";
import { recordFacts } from "./incident.service";
import { ACTION_ENTITY, actionHref, INCIDENT_ENTITY, linkedIncidentIds, refreshIncidentStatus, toDate, todayFor } from "./support";
import { actionCompletionBlockers, actionReviewBlockers, followUpBlockers } from "./workflow";

/**
 * Corrective / preventive actions and their child tasks. One action may address several
 * incidents; its state drives every linked incident's derived status (refreshed here).
 */

export const ACTION_AUDIT = {
  CREATED: "ACTION_CREATED",
  UPDATED: "ACTION_UPDATED",
  LINKED: "ACTION_LINKED",
  UNLINKED: "ACTION_UNLINKED",
  STARTED: "ACTION_STARTED",
  COMPLETED: "ACTION_COMPLETED",
  REVIEWED: "ACTION_REVIEWED",
  FOLLOW_UP_RAISED: "ACTION_FOLLOW_UP_RAISED",
  TASK_ADDED: "ACTION_TASK_ADDED",
  TASK_UPDATED: "ACTION_TASK_UPDATED",
  TASK_COMPLETED: "ACTION_TASK_COMPLETED",
  TREND_REFRESHED: "ACTION_TREND_REFRESHED",
} as const;

const actionRecordSelect = {
  id: true,
  reference: true,
  version: true,
  description: true,
  kind: true,
  ownerId: true,
  reviewerId: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
  dueDate: true,
  priority: true,
  capaCategory: true,
  plannedReviewDate: true,
  state: true,
  parentActionId: true,
  sourceType: true,
  sourceId: true,
  sourceKey: true,
  sourceLabel: true,
  sourceHref: true,
  trend: true,
  archivedAt: true,
  incidents: { select: { incidentId: true } },
  tasks: { select: { id: true, title: true, done: true, ownerId: true }, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.CorrectiveActionSelect;

export type ActionRecord = Prisma.CorrectiveActionGetPayload<{ select: typeof actionRecordSelect }>;

export async function loadVisibleAction(db: DbClient, user: CurrentUser, id: string): Promise<ActionRecord> {
  const row = await db.correctiveAction.findFirst({ where: { AND: [{ id }, actionVisibleWhere(user)] }, select: actionRecordSelect });
  if (!row) throw new NotFoundError();
  return row;
}

export function actionFacts(a: Pick<ActionRecord, "ownerId" | "reviewerId" | "businessUnitId" | "siteId" | "locationId" | "departmentId">): ActionRecordFacts {
  return { ownerId: a.ownerId, reviewerId: a.reviewerId, businessUnitId: a.businessUnitId, siteId: a.siteId, locationId: a.locationId, departmentId: a.departmentId };
}

function blocked(message: string, blockers: string[]): never {
  throw new BusinessRuleError(`${message}: ${blockers.join(" ")}`, { blockers });
}

async function assertActiveUser(db: DbClient, id: string | null | undefined, what: string): Promise<void> {
  if (!id) return;
  const found = await db.user.count({ where: { id, isActive: true } });
  if (!found) throw new ValidationError(`Choose an active person as ${what}.`);
}

export interface ActionSourceInput {
  type: string;
  id: string;
  key?: string | null;
  label: string;
  href?: string | null;
}

export interface NewActionData {
  description: string;
  kind: ActionKindKey;
  ownerId: string;
  placement: ResolvedPlacement;
  dueDate: string;
  priority: PriorityKey;
  capaCategory: string | null;
  reviewerId: string | null;
  plannedReviewDate: string | null;
  incidentIds: string[];
  parentActionId?: string | null;
  source?: ActionSourceInput | null;
  trend?: Prisma.InputJsonValue | null;
}

/**
 * Writes an action inside the caller's transaction (number, links, audit, owner notification,
 * linked incident status). Callers validate access and inputs first.
 */
export async function insertAction(tx: DbClient, user: CurrentUser, data: NewActionData, meta?: RequestMeta): Promise<{ id: string; reference: string }> {
  const organizationId = requireTenantId();
  const reference = await numberingService.next(tx, "corrective-action");
  const row = await tx.correctiveAction.create({
    data: {
      organizationId,
      reference,
      description: data.description.trim(),
      kind: data.kind,
      ownerId: data.ownerId,
      ...data.placement,
      dueDate: toDate(data.dueDate),
      priority: data.priority,
      capaCategory: data.capaCategory,
      reviewerId: data.reviewerId,
      plannedReviewDate: data.plannedReviewDate ? toDate(data.plannedReviewDate) : null,
      parentActionId: data.parentActionId ?? null,
      sourceType: data.source?.type ?? null,
      sourceId: data.source?.id ?? null,
      sourceKey: data.source?.key ?? null,
      sourceLabel: data.source?.label ?? null,
      sourceHref: data.source?.href ?? null,
      trend: data.trend ?? undefined,
      createdById: user.id,
    },
    select: { id: true },
  });
  const incidentIds = [...new Set(data.incidentIds)];
  if (incidentIds.length) {
    await tx.actionIncident.createMany({ data: incidentIds.map((incidentId) => ({ organizationId, actionId: row.id, incidentId, linkedById: user.id })) });
  }
  await recordAudit(
    {
      entityType: ACTION_ENTITY,
      entityId: row.id,
      action: data.parentActionId ? ACTION_AUDIT.FOLLOW_UP_RAISED : ACTION_AUDIT.CREATED,
      actor: user,
      changes: { reference, description: data.description, kind: data.kind, ownerId: data.ownerId, dueDate: data.dueDate, incidents: incidentIds.length },
      metadata: { parentActionId: data.parentActionId ?? null, source: data.source ? { type: data.source.type, id: data.source.id, label: data.source.label } : null },
      meta,
    },
    tx,
  );
  for (const incidentId of incidentIds) {
    await recordAudit({ entityType: INCIDENT_ENTITY, entityId: incidentId, action: ACTION_AUDIT.LINKED, actor: user, metadata: { actionId: row.id, reference }, meta }, tx);
  }
  if (data.ownerId !== user.id) {
    await notificationService.notify(
      {
        userIds: [data.ownerId],
        type: "incident.action.assigned",
        title: `${reference} – action assigned to you`,
        body: data.description,
        link: actionHref(row.id),
        entityType: ACTION_ENTITY,
        entityId: row.id,
        dedupeKey: `incident.action.assigned:${row.id}:${data.ownerId}`,
      },
      tx,
    );
  }
  await refreshIncidentStatus(tx, incidentIds);
  return { id: row.id, reference };
}

/** Incidents an action may be linked to by this user: visible, submitted, open, not archived. */
async function linkableIncidents(db: DbClient, user: CurrentUser, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const rows = await db.incident.findMany({
    where: { AND: [{ id: { in: unique } }, incidentVisibleWhere(user)] },
    select: {
      id: true,
      reference: true,
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
    },
  });
  if (rows.length !== unique.length) throw new NotFoundError("Incident not found");
  for (const row of rows) {
    const facts = recordFacts(row);
    if (facts.isDraft) blocked("Cannot link the action", [`${row.reference} is still a draft – submit it first.`]);
    if (facts.closed) blocked("Cannot link the action", [`${row.reference} is closed – reopen it first.`]);
    if (!canRaiseAction(user, facts)) throw new ForbiddenError(`You cannot add actions to ${row.reference}.`);
  }
  return rows;
}

async function placementFor(db: DbClient, departmentId: string | null, fallback: { businessUnitId: string | null; siteId: string | null; locationId: string | null; departmentId: string | null } | null): Promise<ResolvedPlacement> {
  if (departmentId) return resolvePlacement({ departmentId }, db);
  if (fallback) return { businessUnitId: fallback.businessUnitId, siteId: fallback.siteId, locationId: fallback.locationId, departmentId: fallback.departmentId };
  return { businessUnitId: null, siteId: null, locationId: null, departmentId: null };
}

async function refreshForAction(tx: DbClient, actionId: string): Promise<void> {
  await refreshIncidentStatus(tx, await linkedIncidentIds(tx, actionId));
}

export const actionService = {
  /** Corrective/preventive action from one or more incidents (a corrective action needs at least one). */
  async create(input: ActionCreateInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string; reference: string }> {
    if (input.kind === "CORRECTIVE" && input.incidentIds.length === 0) {
      blocked("A corrective action needs an incident", ["Link at least one incident (actions from audits, inspections or legal checks are raised from those records)."]);
    }
    const incidents = await linkableIncidents(prisma, user, input.incidentIds);
    await assertActiveUser(prisma, input.ownerId, "owner");
    await assertActiveUser(prisma, input.reviewerId, "reviewer");
    const placement = await placementFor(prisma, input.departmentId, incidents[0] ?? null);
    // A stand-alone preventive action needs the create permission where it is placed.
    if (!incidents.length && !canEditAction(user, { ...placement, ownerId: input.ownerId, reviewerId: input.reviewerId })) throw new ForbiddenError();
    const capaCategory = await listLabel(prisma, "incident.capa-category", input.capaCategory, null, "action category");
    return prisma.$transaction((tx) =>
      insertAction(
        tx,
        user,
        {
          description: input.description,
          kind: input.kind,
          ownerId: input.ownerId,
          placement,
          dueDate: input.dueDate,
          priority: input.priority,
          capaCategory,
          reviewerId: input.reviewerId,
          plannedReviewDate: input.plannedReviewDate,
          incidentIds: incidents.map((i) => i.id),
        },
        meta,
      ),
    );
  },

  /** Edit the plan (owner, dates, reviewer …). Allowed until the effectiveness decision; ownership changes keep every gate. */
  async update(id: string, input: ActionUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAction(prisma, user, id);
    if (!canEditAction(user, actionFacts(row))) throw new ForbiddenError();
    if (row.state === "EFFECTIVE" || row.state === "INEFFECTIVE") blocked("The action is closed", [`The action was reviewed as ${ACTION_STATE_LABELS[row.state].toLowerCase()}.`]);
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    await assertActiveUser(prisma, input.ownerId, "owner");
    await assertActiveUser(prisma, input.reviewerId, "reviewer");
    const placement = await placementFor(prisma, input.departmentId, row);
    const capaCategory = await listLabel(prisma, "incident.capa-category", input.capaCategory, row.capaCategory, "action category");
    const data = {
      description: input.description.trim(),
      ownerId: input.ownerId,
      ...placement,
      dueDate: toDate(input.dueDate),
      priority: input.priority,
      capaCategory,
      reviewerId: input.reviewerId,
      plannedReviewDate: input.plannedReviewDate ? toDate(input.plannedReviewDate) : null,
    };
    await prisma.$transaction(async (tx) => {
      const updated = await tx.correctiveAction.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.UPDATED, actor: user, changes: diff(row as unknown as Record<string, unknown>, data), meta }, tx);
      if (input.ownerId !== row.ownerId && input.ownerId !== user.id) {
        await notificationService.notify(
          { userIds: [input.ownerId], type: "incident.action.assigned", title: `${row.reference} – action assigned to you`, body: data.description, link: actionHref(id), entityType: ACTION_ENTITY, entityId: id, dedupeKey: `incident.action.assigned:${id}:${input.ownerId}` },
          tx,
        );
      }
    });
  },

  /** Link an existing action to another incident: one shared action, progress visible from every incident (I-08). */
  async link(id: string, incidentId: string, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAction(prisma, user, id);
    if (row.incidents.some((i) => i.incidentId === incidentId)) return;
    const [incident] = await linkableIncidents(prisma, user, [incidentId]);
    if (row.state === "EFFECTIVE" || row.state === "INEFFECTIVE") blocked("Cannot link", ["Link an open action – this one has already been reviewed."]);
    await prisma.$transaction(async (tx) => {
      await tx.actionIncident.create({ data: { organizationId: requireTenantId(), actionId: id, incidentId, linkedById: user.id } });
      await recordAudit({ entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.LINKED, actor: user, metadata: { incidentId, incidentReference: incident!.reference }, meta }, tx);
      await recordAudit({ entityType: INCIDENT_ENTITY, entityId: incidentId, action: ACTION_AUDIT.LINKED, actor: user, metadata: { actionId: id, reference: row.reference }, meta }, tx);
      await refreshIncidentStatus(tx, [incidentId]);
    });
  },

  /** Remove an incident association explicitly (a corrective action without another origin keeps at least one incident). */
  async unlink(id: string, incidentId: string, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAction(prisma, user, id);
    if (!canEditAction(user, actionFacts(row))) throw new ForbiddenError();
    if (!row.incidents.some((i) => i.incidentId === incidentId)) return;
    if (row.kind === "CORRECTIVE" && !row.sourceType && row.incidents.length <= 1) {
      blocked("Cannot unlink", ["A corrective action keeps at least one incident."]);
    }
    await prisma.$transaction(async (tx) => {
      await tx.actionIncident.delete({ where: { actionId_incidentId: { actionId: id, incidentId } } });
      await recordAudit({ entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.UNLINKED, actor: user, metadata: { incidentId }, meta }, tx);
      await recordAudit({ entityType: INCIDENT_ENTITY, entityId: incidentId, action: ACTION_AUDIT.UNLINKED, actor: user, metadata: { actionId: id, reference: row.reference }, meta }, tx);
      await refreshIncidentStatus(tx, [incidentId]);
    });
  },

  async start(id: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAction(prisma, user, id);
    if (!canWorkOnAction(user, actionFacts(row))) throw new ForbiddenError();
    if (row.state !== "OPEN") return;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.correctiveAction.updateMany({ where: { id, version: expectedVersion, state: "OPEN" }, data: { state: "IN_PROGRESS", version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.STARTED, actor: user, meta }, tx);
      await refreshForAction(tx, id);
    });
  },

  /** Complete → Awaiting effectiveness (never Effective). Every child task must be done first (I-05). */
  async complete(
    id: string,
    input: { completionComment: string; reviewerId: string | null; plannedReviewDate: string | null; expectedVersion: number },
    user: CurrentUser,
    meta: RequestMeta,
  ): Promise<void> {
    const row = await loadVisibleAction(prisma, user, id);
    if (!canWorkOnAction(user, actionFacts(row))) throw new ForbiddenError();
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const reviewerId = input.reviewerId ?? row.reviewerId;
    const plannedReviewDate = input.plannedReviewDate ?? row.plannedReviewDate?.toISOString().slice(0, 10) ?? null;
    await assertActiveUser(prisma, reviewerId, "reviewer");
    const blockers = actionCompletionBlockers({ state: row.state, tasks: row.tasks, completionComment: input.completionComment, reviewerId, plannedReviewDate });
    if (blockers.length) blocked("The action cannot be completed yet", blockers);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.correctiveAction.updateMany({
        where: { id, version: input.expectedVersion, state: { in: ["OPEN", "IN_PROGRESS"] } },
        data: {
          state: "AWAITING_EFFECTIVENESS",
          completionComment: input.completionComment.trim(),
          completedAt: new Date(),
          completedById: user.id,
          reviewerId,
          plannedReviewDate: plannedReviewDate ? toDate(plannedReviewDate) : null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit(
        { entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.COMPLETED, actor: user, changes: { completionComment: input.completionComment.trim(), reviewerId, plannedReviewDate }, meta },
        tx,
      );
      if (reviewerId && reviewerId !== user.id) {
        await notificationService.notify(
          {
            userIds: [reviewerId],
            type: "incident.action.review",
            title: `${row.reference} – effectiveness review on ${plannedReviewDate}`,
            body: row.description,
            link: actionHref(id),
            entityType: ACTION_ENTITY,
            entityId: id,
            dedupeKey: `incident.action.review:${id}:${plannedReviewDate}`,
          },
          tx,
        );
      }
      await refreshForAction(tx, id);
    });
  },

  /** Effective / Ineffective on or after the planned date, with a comment. No administrator override (I-06). */
  async review(id: string, input: { outcome: "EFFECTIVE" | "INEFFECTIVE"; comment: string; expectedVersion: number }, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAction(prisma, user, id);
    if (!canReviewAction(user, actionFacts(row))) throw new ForbiddenError();
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const blockers = actionReviewBlockers({
      state: row.state,
      plannedReviewDate: row.plannedReviewDate?.toISOString().slice(0, 10) ?? null,
      today: todayFor(user.timeZone),
      comment: input.comment,
    });
    if (blockers.length) blocked("Effectiveness cannot be recorded yet", blockers);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.correctiveAction.updateMany({
        where: { id, version: input.expectedVersion, state: "AWAITING_EFFECTIVENESS" },
        data: { state: input.outcome, reviewComment: input.comment.trim(), reviewedAt: new Date(), reviewedById: user.id, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.REVIEWED, actor: user, changes: { outcome: input.outcome, comment: input.comment.trim() }, meta }, tx);
      if (input.outcome === "INEFFECTIVE" && row.ownerId !== user.id) {
        await notificationService.notify(
          { userIds: [row.ownerId], type: "incident.action.ineffective", title: `${row.reference} was not effective – follow-up needed`, body: input.comment.trim(), link: actionHref(id), entityType: ACTION_ENTITY, entityId: id },
          tx,
        );
      }
      await refreshForAction(tx, id);
    });
  },

  /** Follow-up of an ineffective action: keeps every incident association and the originating context (I-07). */
  async followUp(id: string, input: FollowUpCreateInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string; reference: string }> {
    const row = await loadVisibleAction(prisma, user, id);
    const facts = actionFacts(row);
    if (!canEditAction(user, facts) && !canReviewAction(user, facts) && !canWorkOnAction(user, facts)) throw new ForbiddenError();
    const blockers = followUpBlockers(row.state);
    if (blockers.length) blocked("No follow-up needed", blockers);
    await assertActiveUser(prisma, input.ownerId, "owner");
    await assertActiveUser(prisma, input.reviewerId, "reviewer");
    const placement = await placementFor(prisma, input.departmentId, row);
    const capaCategory = await listLabel(prisma, "incident.capa-category", input.capaCategory, row.capaCategory, "action category");
    return prisma.$transaction((tx) =>
      insertAction(
        tx,
        user,
        {
          description: input.description,
          kind: row.kind,
          ownerId: input.ownerId,
          placement,
          dueDate: input.dueDate,
          priority: input.priority,
          capaCategory,
          reviewerId: input.reviewerId,
          plannedReviewDate: input.plannedReviewDate,
          incidentIds: row.incidents.map((i) => i.incidentId),
          parentActionId: row.id,
          source: row.sourceType ? { type: row.sourceType, id: row.sourceId!, key: row.sourceKey, label: row.sourceLabel ?? row.sourceType, href: row.sourceHref } : null,
        },
        meta,
      ),
    );
  },

  // ── Child tasks ────────────────────────────────────────────────────────────

  async addTask(actionId: string, input: TaskInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    const row = await loadVisibleAction(prisma, user, actionId);
    const facts = actionFacts(row);
    if (!canEditAction(user, facts) && !canWorkOnAction(user, facts)) throw new ForbiddenError();
    if (row.state !== "OPEN" && row.state !== "IN_PROGRESS") blocked("Cannot add a task", ["Tasks can only be added while the action is open or in progress."]);
    await assertActiveUser(prisma, input.ownerId, "task owner");
    const placement = await placementFor(prisma, input.departmentId, row);
    return prisma.$transaction(async (tx) => {
      const task = await tx.actionTask.create({
        data: {
          organizationId: requireTenantId(),
          actionId,
          title: input.title.trim(),
          ownerId: input.ownerId,
          ...placement,
          dueDate: toDate(input.dueDate),
          priority: input.priority,
          sortOrder: row.tasks.length,
        },
        select: { id: true },
      });
      await recordAudit({ entityType: ACTION_ENTITY, entityId: actionId, action: ACTION_AUDIT.TASK_ADDED, actor: user, changes: { title: input.title, ownerId: input.ownerId, dueDate: input.dueDate }, metadata: { taskId: task.id }, meta }, tx);
      if (input.ownerId !== user.id) {
        await notificationService.notify(
          { userIds: [input.ownerId], type: "incident.task.assigned", title: `${row.reference} – task assigned to you`, body: input.title, link: actionHref(actionId), entityType: ACTION_ENTITY, entityId: actionId, dedupeKey: `incident.task.assigned:${task.id}:${input.ownerId}` },
          tx,
        );
      }
      return task;
    });
  },

  async updateTask(actionId: string, taskId: string, input: TaskInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAction(prisma, user, actionId);
    const facts = actionFacts(row);
    if (!canEditAction(user, facts) && !canWorkOnAction(user, facts)) throw new ForbiddenError();
    const task = await prisma.actionTask.findFirst({ where: { id: taskId, actionId } });
    if (!task) throw new NotFoundError();
    if (task.done) blocked("The task is completed", ["Completed tasks are not edited."]);
    await assertActiveUser(prisma, input.ownerId, "task owner");
    const placement = await placementFor(prisma, input.departmentId, row);
    const data = { title: input.title.trim(), ownerId: input.ownerId, ...placement, dueDate: toDate(input.dueDate), priority: input.priority };
    await prisma.$transaction(async (tx) => {
      await tx.actionTask.update({ where: { id: taskId }, data });
      await recordAudit({ entityType: ACTION_ENTITY, entityId: actionId, action: ACTION_AUDIT.TASK_UPDATED, actor: user, changes: diff(task as unknown as Record<string, unknown>, data), metadata: { taskId }, meta }, tx);
    });
  },

  /** Completing a task never completes its action (cross-module rule). */
  async completeTask(actionId: string, taskId: string, completionComment: string, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleAction(prisma, user, actionId);
    const task = await prisma.actionTask.findFirst({ where: { id: taskId, actionId } });
    if (!task) throw new NotFoundError();
    if (!canCompleteTask(user, actionFacts(row), task)) throw new ForbiddenError();
    if (task.done) return;
    if (!completionComment.trim()) blocked("The task cannot be completed yet", ["Describe what was done."]);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.actionTask.updateMany({
        where: { id: taskId, done: false },
        data: { done: true, completionComment: completionComment.trim(), completedAt: new Date(), completedById: user.id },
      });
      if (updated.count !== 1) return;
      await recordAudit(
        { entityType: ACTION_ENTITY, entityId: actionId, action: ACTION_AUDIT.TASK_COMPLETED, actor: user, changes: { title: task.title, completionComment: completionComment.trim() }, metadata: { taskId }, meta },
        tx,
      );
    });
  },
};
