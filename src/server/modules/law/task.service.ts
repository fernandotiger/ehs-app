import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { LawTaskCompleteInput, LawTaskCreateInput, LawTaskUpdateInput } from "@/lib/validation/law";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ForbiddenError, NotFoundError, StaleVersionError } from "@/server/http/errors";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { numberingService } from "@/server/modules/numbering/numbering.service";
import { resolvePlacement } from "@/server/modules/organisation/placement";
import { requireTenantId } from "@/server/tenancy/context";
import { canEvaluate, taskRights, taskVisibleWhere, type LawTaskRecordFacts } from "./law-access.policy";
import { assertEditable, loadVisibleRequirement, requirementFacts } from "./requirement.service";
import { assertActiveUser, assertDepartmentAtSite, blocked, dateOnly, LAW_AUDIT, placementOf, TASK_ENTITY, taskHref, toDate, todayFor } from "./support";
import { taskCompletionBlockers, taskSaveBlockers } from "./workflow";

/**
 * Law tasks – the work needed to close a compliance gap. They belong to a requirement (so the
 * source can always be opened), sit in a department of the profile's site, are completed with a
 * required comment and can be archived / restored. Completing a task never changes the evaluation.
 */

export const taskSelect = {
  id: true,
  reference: true,
  requirementId: true,
  profileId: true,
  title: true,
  details: true,
  ownerId: true,
  priority: true,
  status: true,
  dueDate: true,
  completedOn: true,
  completedById: true,
  completionNotes: true,
  createdById: true,
  createdAt: true,
  version: true,
  archivedAt: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
  requirement: { select: { id: true, reference: true, title: true, register: true, category: true, profile: { select: { id: true, name: true, siteId: true } } } },
} satisfies Prisma.LawTaskSelect;

export type TaskRow = Prisma.LawTaskGetPayload<{ select: typeof taskSelect }>;

export async function loadVisibleTask(db: DbClient, user: CurrentUser, id: string): Promise<TaskRow> {
  const row = await db.lawTask.findFirst({ where: { AND: [{ id }, taskVisibleWhere(user)] }, select: taskSelect });
  if (!row) throw new NotFoundError();
  return row;
}

export const taskFacts = (row: TaskRow): LawTaskRecordFacts => ({ ...placementOf(row), ownerId: row.ownerId, createdById: row.createdById, status: row.status, archived: Boolean(row.archivedAt) });

async function notifyOwner(db: DbClient, actor: CurrentUser, t: { id: string; reference: string; title: string; ownerId: string; dueDate: string }) {
  if (t.ownerId === actor.id) return;
  await notificationService.notify(
    {
      userIds: [t.ownerId],
      type: "law.task-assigned",
      title: `${t.reference} – a compliance task was assigned to you`,
      body: `${t.title} · due ${t.dueDate}`,
      link: taskHref(t.id),
      entityType: TASK_ENTITY,
      entityId: t.id,
      dedupeKey: `law.task-assigned:${t.id}:${t.ownerId}`,
    },
    db,
  );
}

export const lawTaskService = {
  async create(input: LawTaskCreateInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string; reference: string }> {
    const requirement = await loadVisibleRequirement(prisma, user, input.requirementId);
    if (!canEvaluate(user, requirementFacts(requirement))) throw new ForbiddenError("You cannot add tasks to this requirement.");
    assertEditable(requirement, "The task cannot be added");
    const gates = taskSaveBlockers({ ...input, today: todayFor(user.timeZone) });
    if (gates.length) blocked("The task cannot be added", gates);
    await assertDepartmentAtSite(prisma, input.departmentId!, requirement.profile.siteId);
    await assertActiveUser(prisma, input.ownerId!, "who will do it");
    const placement = await resolvePlacement({ departmentId: input.departmentId });
    const title = input.title.trim();
    return prisma.$transaction(async (tx) => {
      const reference = await numberingService.next(tx, "law-task");
      const row = await tx.lawTask.create({
        data: {
          organizationId: requireTenantId(),
          reference,
          requirementId: requirement.id,
          profileId: requirement.profileId,
          title,
          details: input.details,
          ownerId: input.ownerId!,
          priority: input.priority,
          dueDate: toDate(input.dueDate!),
          ...placement,
          createdById: user.id,
        },
        select: { id: true },
      });
      await recordAudit(
        {
          entityType: TASK_ENTITY,
          entityId: row.id,
          action: LAW_AUDIT.TASK_CREATED,
          actor: user,
          changes: { reference, title, ownerId: input.ownerId, dueDate: input.dueDate, priority: input.priority, departmentId: placement.departmentId },
          metadata: { requirement: `${requirement.reference} · ${requirement.title}` },
          meta,
        },
        tx,
      );
      await notifyOwner(tx, user, { id: row.id, reference, title, ownerId: input.ownerId!, dueDate: input.dueDate! });
      return { id: row.id, reference };
    });
  },

  async update(id: string, input: LawTaskUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleTask(prisma, user, id);
    if (!taskRights(user, taskFacts(row)).edit) {
      if (row.archivedAt || row.status === "COMPLETED") blocked("The task cannot be changed", [row.archivedAt ? "Restore the task first." : "The task is already done."]);
      throw new ForbiddenError();
    }
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const gates = taskSaveBlockers({ ...input, today: todayFor(user.timeZone), currentDueDate: dateOnly(row.dueDate) });
    if (gates.length) blocked("The task cannot be saved", gates);
    if (input.departmentId !== row.departmentId) await assertDepartmentAtSite(prisma, input.departmentId!, row.requirement.profile.siteId);
    if (input.ownerId !== row.ownerId) await assertActiveUser(prisma, input.ownerId!, "who will do it");
    const placement = await resolvePlacement({ departmentId: input.departmentId });
    const title = input.title.trim();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.lawTask.updateMany({
        where: { id, version: input.expectedVersion, status: "OPEN", archivedAt: null },
        data: { title, details: input.details, ownerId: input.ownerId!, priority: input.priority, dueDate: toDate(input.dueDate!), ...placement, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      const diff = <T>(key: string, from: T, to: T) => (JSON.stringify(from) !== JSON.stringify(to) ? { [key]: { from, to } } : {});
      await recordAudit(
        {
          entityType: TASK_ENTITY,
          entityId: id,
          action: LAW_AUDIT.TASK_UPDATED,
          actor: user,
          changes: {
            ...diff("title", row.title, title),
            ...diff("details", row.details, input.details),
            ...diff("ownerId", row.ownerId, input.ownerId),
            ...diff("priority", row.priority, input.priority),
            ...diff("dueDate", dateOnly(row.dueDate), input.dueDate),
            ...diff("departmentId", row.departmentId, placement.departmentId),
          },
          meta,
        },
        tx,
      );
      if (input.ownerId !== row.ownerId) await notifyOwner(tx, user, { id, reference: row.reference, title, ownerId: input.ownerId!, dueDate: input.dueDate! });
    });
  },

  /** Needs a completion comment. The evaluation, rating and review flag do NOT change. */
  async complete(id: string, input: LawTaskCompleteInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleTask(prisma, user, id);
    const gates = taskCompletionBlockers({ status: row.status, archived: Boolean(row.archivedAt), notes: input.notes });
    if (gates.length) blocked("The task cannot be completed", gates);
    if (!taskRights(user, taskFacts(row)).work) throw new ForbiddenError();
    const today = todayFor(user.timeZone);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.lawTask.updateMany({
        where: { id, version: input.expectedVersion, status: "OPEN", archivedAt: null },
        data: { status: "COMPLETED", completedOn: toDate(today), completedAt: new Date(), completedById: user.id, completionNotes: input.notes.trim(), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: TASK_ENTITY, entityId: id, action: LAW_AUDIT.TASK_COMPLETED, actor: user, changes: { status: { from: "OPEN", to: "COMPLETED" }, ownerId: row.ownerId }, metadata: { notes: input.notes.trim() }, meta }, tx);
      if (row.createdById !== user.id) {
        await notificationService.notify(
          { userIds: [row.createdById], type: "law.task-completed", title: `${row.reference} was completed`, body: `${row.title} – remember to update the evaluation of ${row.requirement.reference} if needed.`, link: taskHref(id), entityType: TASK_ENTITY, entityId: id },
          tx,
        );
      }
    });
  },

  async setArchived(id: string, archived: boolean, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleTask(prisma, user, id);
    const rights = taskRights(user, taskFacts(row));
    if (archived ? !rights.archive : !rights.restore) {
      if (Boolean(row.archivedAt) === archived) return;
      throw new ForbiddenError();
    }
    await prisma.$transaction(async (tx) => {
      const updated = await tx.lawTask.updateMany({ where: { id, version: expectedVersion }, data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: TASK_ENTITY, entityId: id, action: archived ? LAW_AUDIT.TASK_ARCHIVED : LAW_AUDIT.TASK_RESTORED, actor: user, meta }, tx);
    });
  },
};
