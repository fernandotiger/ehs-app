import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { pendingUploads, validateQuestionnaireAnswers, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import type { ActionCancelInput, ActionCompleteInput, ActionCreateInput, ActionUpdateInput } from "@/lib/validation/actions";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ForbiddenError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { numberingService } from "@/server/modules/numbering/numbering.service";
import { resolvePlacement } from "@/server/modules/organisation/placement";
import { uploadService } from "@/server/modules/uploads/upload.service";
import { requireTenantId } from "@/server/tenancy/context";
import { actionRights, actionVisibleWhere, canCreateActionAt, canManageAction, type ActionRecordFacts } from "./action-access.policy";
import {
  ACTION_AUDIT,
  ACTION_ENTITY,
  actionHref,
  asAnswers,
  asSnapshot,
  assertActiveUser,
  blocked,
  captureActionForm,
  dateOnly,
  json,
  placementOf,
  toDate,
  todayFor,
} from "./support";
import { cancelBlockers, commandBlockers, completionBlockers, saveBlockers, transitionSources, transitionTarget } from "./workflow";

/**
 * Standalone actions (not linked to an incident or a risk): create, edit, start, complete,
 * cancel and reopen. Every change is audited in its own transaction; owners are notified when an
 * action is assigned to them, creators when it is completed. Overdue reminders: overdue.ts + jobs.
 */

const actionSelect = {
  id: true,
  reference: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  ownerId: true,
  createdById: true,
  dueDate: true,
  startedAt: true,
  createdAt: true,
  form: true,
  answers: true,
  version: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
} satisfies Prisma.ActionSelect;

type ActionRow = Prisma.ActionGetPayload<{ select: typeof actionSelect }>;

async function loadVisible(db: DbClient, user: CurrentUser, id: string): Promise<ActionRow> {
  const row = await db.action.findFirst({ where: { AND: [{ id }, { archivedAt: null }, actionVisibleWhere(user)] }, select: actionSelect });
  if (!row) throw new NotFoundError();
  return row;
}

const facts = (row: ActionRow): ActionRecordFacts => ({ ...placementOf(row), ownerId: row.ownerId, createdById: row.createdById, status: row.status });

/** Answers to the captured questions: required ones on every save (malformed answers → 422). */
function checkAnswers(snapshot: QuestionnaireSnapshot, answers: FormValues): FormValues {
  const check = validateQuestionnaireAnswers(snapshot, answers, { mode: "submit" });
  if (!check.valid) {
    const labels = snapshot.fields.filter((f) => check.errors[f.key]).map((f) => f.label);
    throw new ValidationError(`Answer the questions below the action: ${labels.join(", ")}.`, { fieldErrors: check.errors });
  }
  return check.data;
}

/** Consumes uploads referenced by `file` answers as evidence on the action; answers keep the attachment ids. */
async function attachFileAnswers(tx: DbClient, user: CurrentUser, actionId: string, snapshot: QuestionnaireSnapshot, answers: FormValues): Promise<FormValues> {
  const pending = pendingUploads(snapshot, answers);
  if (!pending.length) return answers;
  const out: FormValues = { ...answers };
  for (const item of pending) {
    const file = await uploadService.consume(item.uploadId, user, "evidence", tx);
    const row = await tx.attachment.create({
      data: {
        organizationId: user.organizationId,
        entityType: ACTION_ENTITY,
        entityId: actionId,
        kind: "FILE",
        name: file.fileName,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageDriver: file.storageDriver,
        storageKey: file.storageKey,
        uploadedById: user.id,
      },
    });
    out[item.fieldKey] = (out[item.fieldKey] as { uploadId?: string; attachmentId?: string; fileName: string; sizeBytes?: number }[]).map((f) =>
      f.uploadId === item.uploadId ? { attachmentId: row.id, fileName: f.fileName, sizeBytes: f.sizeBytes } : f,
    );
  }
  return out;
}

async function notifyAssigned(db: DbClient, actor: CurrentUser, a: { id: string; reference: string; title: string; ownerId: string; dueDate: string }) {
  if (a.ownerId === actor.id) return;
  await notificationService.notify(
    {
      userIds: [a.ownerId],
      type: "action.assigned",
      title: `${a.reference} – an action was assigned to you`,
      body: `${a.title} · due ${a.dueDate}`,
      link: actionHref(a.id),
      entityType: ACTION_ENTITY,
      entityId: a.id,
      dedupeKey: `action.assigned:${a.id}:${a.ownerId}`,
    },
    db,
  );
}

async function notifyPerson(db: DbClient, actor: CurrentUser, userId: string, type: string, title: string, a: { id: string; title: string }) {
  if (userId === actor.id) return;
  await notificationService.notify({ userIds: [userId], type, title, body: a.title, link: actionHref(a.id), entityType: ACTION_ENTITY, entityId: a.id }, db);
}

/** Where the action applies: the chosen department, or the whole company. */
async function placementFor(departmentId: string | null) {
  const placement = await resolvePlacement({ departmentId });
  return { placement, hasDepartment: Boolean(placement.departmentId) };
}

export const actionService = {
  /** New action (idempotent on clientId), optionally with the extra questions of a published Actions form. */
  async create(input: ActionCreateInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string; reference: string }> {
    if (input.clientId) {
      const existing = await prisma.action.findFirst({ where: { clientId: input.clientId, createdById: user.id }, select: { id: true, reference: true } });
      if (existing) return existing;
    }
    const { placement, hasDepartment } = await placementFor(input.departmentId);
    if (!canCreateActionAt(user, hasDepartment ? placement : null)) throw new ForbiddenError("You cannot create actions here.");
    const today = todayFor(user.timeZone);
    const gates = saveBlockers({ title: input.title, ownerId: input.ownerId, dueDate: input.dueDate, today });
    if (gates.length) blocked("The action cannot be created", gates);
    await assertActiveUser(prisma, input.ownerId!, "who will do it");

    const snapshot = input.formVersionId ? await captureActionForm(prisma, input.formVersionId, placement.siteId) : null;
    const answers = snapshot ? checkAnswers(snapshot, input.answers) : {};
    const organizationId = requireTenantId();
    const title = input.title.trim();

    try {
      return await prisma.$transaction(async (tx) => {
        const reference = await numberingService.next(tx, "action");
        const row = await tx.action.create({
          data: {
            organizationId,
            reference,
            clientId: input.clientId ?? null,
            title,
            description: input.description,
            priority: input.priority,
            ownerId: input.ownerId!,
            createdById: user.id,
            dueDate: toDate(input.dueDate),
            ...placement,
            formId: snapshot?.formId ?? null,
            formVersionId: snapshot?.versionId ?? null,
            form: snapshot ? json(snapshot) : Prisma.DbNull,
            answers: snapshot ? json(answers) : Prisma.DbNull,
          },
          select: { id: true },
        });
        if (snapshot) {
          const stored = await attachFileAnswers(tx, user, row.id, snapshot, answers);
          if (stored !== answers) await tx.action.update({ where: { id: row.id }, data: { answers: json(stored) } });
        }
        await recordAudit(
          {
            entityType: ACTION_ENTITY,
            entityId: row.id,
            action: ACTION_AUDIT.CREATED,
            actor: user,
            changes: { reference, title, ownerId: input.ownerId, dueDate: input.dueDate, priority: input.priority, departmentId: placement.departmentId },
            metadata: snapshot ? { form: snapshot.name, formVersion: snapshot.version } : null,
            meta,
          },
          tx,
        );
        await notifyAssigned(tx, user, { id: row.id, reference, title, ownerId: input.ownerId!, dueDate: input.dueDate });
        return { id: row.id, reference };
      });
    } catch (error) {
      // A repeated submit raced the first one: return the action it created.
      if (input.clientId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.action.findFirst({ where: { clientId: input.clientId, createdById: user.id }, select: { id: true, reference: true } });
        if (existing) return existing;
      }
      throw error;
    }
  },

  /** Edit open work (creator or manager), with optimistic concurrency. The captured form never changes. */
  async update(id: string, input: ActionUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisible(prisma, user, id);
    if (!actionRights(user, facts(row)).edit) {
      if (row.status === "COMPLETED" || row.status === "CANCELLED") blocked("The action cannot be changed", [`Reopen the action first – it is ${row.status === "COMPLETED" ? "completed" : "cancelled"}.`]);
      throw new ForbiddenError();
    }
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const { placement, hasDepartment } = await placementFor(input.departmentId);
    if (placement.departmentId !== row.departmentId && !canManageAction(user, placement) && !canCreateActionAt(user, hasDepartment ? placement : null)) {
      throw new ForbiddenError("You cannot move actions there.");
    }
    const gates = saveBlockers({
      title: input.title,
      ownerId: input.ownerId,
      dueDate: input.dueDate,
      today: todayFor(user.timeZone),
      createdOn: todayFor(user.timeZone, row.createdAt),
      currentDueDate: dateOnly(row.dueDate),
    });
    if (gates.length) blocked("The action cannot be saved", gates);
    if (input.ownerId !== row.ownerId) await assertActiveUser(prisma, input.ownerId!, "who will do it");
    const snapshot = asSnapshot(row.form);
    const answers = snapshot ? checkAnswers(snapshot, input.answers) : null;
    const title = input.title.trim();
    const dueDate = input.dueDate;

    await prisma.$transaction(async (tx) => {
      const stored = snapshot && answers ? await attachFileAnswers(tx, user, id, snapshot, answers) : null;
      const updated = await tx.action.updateMany({
        where: { id, version: input.expectedVersion, status: { in: ["OPEN", "IN_PROGRESS"] } },
        data: {
          title,
          description: input.description,
          priority: input.priority,
          ownerId: input.ownerId!,
          dueDate: toDate(dueDate),
          ...placement,
          ...(stored ? { answers: json(stored) } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      const before = asAnswers(row.answers);
      const changes: Record<string, unknown> = {
        ...(row.title !== title ? { title: { from: row.title, to: title } } : {}),
        ...(row.description !== input.description ? { description: { from: row.description, to: input.description } } : {}),
        ...(row.priority !== input.priority ? { priority: { from: row.priority, to: input.priority } } : {}),
        ...(row.ownerId !== input.ownerId ? { ownerId: { from: row.ownerId, to: input.ownerId } } : {}),
        ...(dateOnly(row.dueDate) !== dueDate ? { dueDate: { from: dateOnly(row.dueDate), to: dueDate } } : {}),
        ...(row.departmentId !== placement.departmentId ? { departmentId: { from: row.departmentId, to: placement.departmentId } } : {}),
        ...(stored && JSON.stringify(before) !== JSON.stringify(stored) ? { answers: "changed" } : {}),
      };
      await recordAudit({ entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.UPDATED, actor: user, changes, meta }, tx);
      if (row.ownerId !== input.ownerId) await notifyAssigned(tx, user, { id, reference: row.reference, title, ownerId: input.ownerId!, dueDate });
    });
  },

  async start(id: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisible(prisma, user, id);
    const gates = commandBlockers(row.status, "start");
    if (gates.length) blocked("The action cannot be started", gates);
    if (!actionRights(user, facts(row)).work) throw new ForbiddenError();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.action.updateMany({
        where: { id, version: expectedVersion, status: { in: transitionSources("start") } },
        data: { status: transitionTarget("start"), startedAt: new Date(), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.STARTED, actor: user, meta }, tx);
    });
  },

  /** What was done + the date (between creation and today). A manager completes without changing the owner. */
  async complete(id: string, input: ActionCompleteInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisible(prisma, user, id);
    if (!actionRights(user, facts(row)).work && (row.status === "OPEN" || row.status === "IN_PROGRESS")) throw new ForbiddenError();
    const today = todayFor(user.timeZone);
    const gates = completionBlockers({
      status: row.status,
      notes: input.notes,
      completedOn: /^\d{4}-\d{2}-\d{2}$/.test(input.completedOn) ? input.completedOn : null,
      createdOn: todayFor(user.timeZone, row.createdAt),
      today,
    });
    if (gates.length) blocked("The action cannot be completed yet", gates);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.action.updateMany({
        where: { id, version: input.expectedVersion, status: { in: transitionSources("complete") } },
        data: {
          status: transitionTarget("complete"),
          completedOn: toDate(input.completedOn),
          completedAt: new Date(),
          completedById: user.id,
          completionNotes: input.notes.trim(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit(
        { entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.COMPLETED, actor: user, changes: { completedOn: input.completedOn, ownerId: row.ownerId }, metadata: { notes: input.notes.trim() }, meta },
        tx,
      );
      await notifyPerson(tx, user, row.createdById, "action.completed", `${row.reference} was completed`, row);
    });
  },

  async cancel(id: string, input: ActionCancelInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisible(prisma, user, id);
    if (!actionRights(user, facts(row)).cancel && (row.status === "OPEN" || row.status === "IN_PROGRESS")) throw new ForbiddenError();
    const gates = cancelBlockers({ status: row.status, reason: input.reason });
    if (gates.length) blocked("The action cannot be cancelled", gates);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.action.updateMany({
        where: { id, version: input.expectedVersion, status: { in: transitionSources("cancel") } },
        data: { status: transitionTarget("cancel"), cancelledAt: new Date(), cancelledById: user.id, cancelReason: input.reason.trim(), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.CANCELLED, actor: user, metadata: { reason: input.reason.trim() }, meta }, tx);
      await notifyPerson(tx, user, row.ownerId, "action.cancelled", `${row.reference} was cancelled`, row);
    });
  },

  /** Completed / cancelled → To do (completion and cancellation details are cleared; the history keeps them). */
  async reopen(id: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisible(prisma, user, id);
    const gates = commandBlockers(row.status, "reopen");
    if (gates.length) blocked("The action cannot be reopened", gates);
    if (!actionRights(user, facts(row)).reopen) throw new ForbiddenError();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.action.updateMany({
        where: { id, version: expectedVersion, status: { in: transitionSources("reopen") } },
        data: {
          status: transitionTarget("reopen"),
          startedAt: null,
          completedOn: null,
          completedAt: null,
          completedById: null,
          completionNotes: null,
          cancelledAt: null,
          cancelledById: null,
          cancelReason: null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: ACTION_ENTITY, entityId: id, action: ACTION_AUDIT.REOPENED, actor: user, changes: { status: { from: row.status, to: "OPEN" } }, meta }, tx);
      await notifyPerson(tx, user, row.ownerId, "action.reopened", `${row.reference} was reopened`, row);
    });
  },
};
