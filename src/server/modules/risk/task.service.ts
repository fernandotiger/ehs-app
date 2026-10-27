import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { RiskMethod } from "@/lib/risk/scoring";
import type { TaskCompleteInput, TaskCreateInput, TaskUpdateInput } from "@/lib/validation/risk";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ForbiddenError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { numberingService } from "@/server/modules/numbering/numbering.service";
import { requireTenantId } from "@/server/tenancy/context";
import { hazardSnapshot, RISK_AUDIT } from "./assessment.service";
import { readRules } from "./forms";
import { assessmentVisibleWhere, canCreateTaskAt, canEditTask, canWorkOnTask, programmeVisibleWhere, taskVisibleWhere } from "./risk-access.policy";
import { applyFactor, classify, factorValue, findFactor, scoreAssessment, scoreHazard, type HazardValues } from "./scoring";
import { ASSESSMENT_ENTITY, assertActiveUsers, blocked, dateOnly, json, placementOf, TASK_ENTITY, taskHref, toDate, todayFor } from "./support";
import { completionBlockers, isScoringTask, nextRevision, taskBlockers } from "./workflow";

/**
 * Risk tasks: RA (assessment + hazard/aspect, optional scoring factor) and MP (programme work),
 * with sub-tasks. Completing a top-level scoring task on an Approved assessment applies the
 * achieved value, rescoring the assessment as a new revision with the task reference (R-06).
 */

export const TASK_AUDIT = {
  CREATED: "RISK_TASK_CREATED",
  UPDATED: "RISK_TASK_UPDATED",
  STARTED: "RISK_TASK_STARTED",
  COMPLETED: "RISK_TASK_COMPLETED",
} as const;

const taskSelect = {
  id: true,
  reference: true,
  kind: true,
  title: true,
  info: true,
  ownerId: true,
  createdOn: true,
  dueDate: true,
  programmeId: true,
  assessmentId: true,
  hazardId: true,
  factor: true,
  originalValue: true,
  targetValue: true,
  parentId: true,
  status: true,
  version: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
} satisfies Prisma.RiskTaskSelect;

type TaskRow = Prisma.RiskTaskGetPayload<{ select: typeof taskSelect }>;

async function loadVisibleTask(db: DbClient, user: CurrentUser, id: string): Promise<TaskRow> {
  const row = await db.riskTask.findFirst({ where: { AND: [{ id }, taskVisibleWhere(user)] }, select: taskSelect });
  if (!row) throw new NotFoundError();
  return row;
}

interface PreparedTask {
  placement: ReturnType<typeof placementOf>;
  programmeId: string;
  assessmentId: string | null;
  hazardId: string | null;
  factor: string | null;
  originalValue: number | null;
  targetValue: number | null;
}

/** Resolves programme / assessment / hazard / factor and checks the creation gates (R-07). */
async function prepareTask(
  db: DbClient,
  user: CurrentUser,
  input: Omit<TaskUpdateInput, "expectedVersion"> & { kind: "RA" | "MP" },
  parent: TaskRow | null,
  current: TaskRow | null,
): Promise<PreparedTask> {
  // Sub-tasks inherit their parent's programme, assessment and hazard; they never rescore.
  const programmeId = parent ? parent.programmeId : input.programmeId;
  const assessmentId = input.kind === "RA" ? (parent ? parent.assessmentId : input.assessmentId) : null;
  const hazardId = input.kind === "RA" ? (parent ? parent.hazardId : input.hazardId) : null;
  const gates = taskBlockers({
    kind: input.kind,
    title: input.title,
    ownerId: input.ownerId,
    createdOn: input.createdOn,
    dueDate: input.dueDate,
    programmeId,
    assessmentId,
    hazardId,
    parentStatus: parent?.status ?? null,
  });
  if (gates.length) blocked(current ? "The task cannot be saved" : "The task cannot be created", gates);

  const programme = await db.riskProgramme.findFirst({ where: { AND: [{ id: programmeId! }, parent ? {} : programmeVisibleWhere(user)] }, select: { id: true, status: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true } });
  if (!programme) throw new ValidationError("Choose a management programme you can see.");
  if (programme.status === "COMPLETED" && programme.id !== current?.programmeId) throw new ValidationError("The programme is completed – choose an active programme.");
  await assertActiveUsers(db, [input.ownerId], "the responsible person");

  let placement = placementOf(programme);
  let factor: string | null = null;
  let originalValue: number | null = null;
  let targetValue: number | null = null;
  if (input.kind === "RA") {
    const assessment = await db.riskAssessment.findFirst({
      where: { AND: [{ id: assessmentId! }, parent ? {} : assessmentVisibleWhere(user)] },
      select: { id: true, status: true, method: true, domain: true, businessUnitId: true, siteId: true, locationId: true, departmentId: true, hazards: { where: { id: hazardId! }, select: { id: true, likelihood: true, severity: true, factors: true, checklistResult: true } } },
    });
    if (!assessment) throw new ValidationError("Choose an assessment you can see.");
    if (assessment.status === "ARCHIVED") throw new ValidationError("The assessment is archived – restore it before adding tasks.");
    const hazard = assessment.hazards[0];
    if (!hazard) throw new ValidationError("Choose a hazard / aspect of the selected assessment.");
    placement = placementOf(assessment);
    if (!parent && input.factor) {
      const method = assessment.method as RiskMethod;
      const f = findFactor(method, assessment.domain, input.factor);
      if (!f) throw new ValidationError("Choose a scoring factor of the assessment's method.");
      factor = f.key;
      originalValue = factorValue(method, { ...hazard, factors: hazard.factors as Record<string, number> | null }, f.key);
      if (input.targetValue !== null && input.targetValue !== undefined) {
        if (input.targetValue < f.min || input.targetValue > f.max) throw new ValidationError(`The intended ${f.label.toLowerCase()} must be from ${f.min} to ${f.max}.`);
        targetValue = input.targetValue;
      }
    }
  }
  return { placement, programmeId: programme.id, assessmentId, hazardId, factor, originalValue, targetValue };
}

async function notifyOwner(db: DbClient, actor: CurrentUser, task: { id: string; reference: string; title: string; ownerId: string }) {
  if (task.ownerId === actor.id) return;
  await notificationService.notify(
    { userIds: [task.ownerId], type: "risk.task.assigned", title: `${task.reference} – a risk task was assigned to you`, body: task.title, link: taskHref(task.id), entityType: TASK_ENTITY, entityId: task.id, dedupeKey: `risk.task.assigned:${task.id}:${task.ownerId}` },
    db,
  );
}

export const taskService = {
  async create(input: TaskCreateInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string; reference: string }> {
    const parent = input.parentId ? await loadVisibleTask(prisma, user, input.parentId) : null;
    if (parent?.parentId) throw new ValidationError("Sub-tasks cannot have their own sub-tasks.");
    const kind = parent ? parent.kind : input.kind;
    const prepared = await prepareTask(prisma, user, { ...input, kind }, parent, null);
    if (!canCreateTaskAt(user, prepared.placement)) throw new ForbiddenError("You cannot create risk tasks here.");
    const organizationId = requireTenantId();
    return prisma.$transaction(async (tx) => {
      const reference = await numberingService.next(tx, "risk-task");
      const row = await tx.riskTask.create({
        data: {
          organizationId,
          reference,
          kind,
          title: input.title.trim(),
          info: input.info,
          ownerId: input.ownerId!,
          createdOn: toDate(input.createdOn!),
          dueDate: toDate(input.dueDate!),
          programmeId: prepared.programmeId,
          assessmentId: prepared.assessmentId,
          hazardId: prepared.hazardId,
          factor: prepared.factor,
          originalValue: prepared.originalValue,
          targetValue: prepared.targetValue,
          parentId: parent?.id ?? null,
          ...prepared.placement,
          createdById: user.id,
        },
        select: { id: true },
      });
      await recordAudit(
        { entityType: TASK_ENTITY, entityId: row.id, action: TASK_AUDIT.CREATED, actor: user, changes: { reference, title: input.title.trim(), kind, ownerId: input.ownerId, dueDate: input.dueDate, parent: parent?.reference ?? null }, meta },
        tx,
      );
      if (prepared.assessmentId && !parent) {
        await recordAudit({ entityType: ASSESSMENT_ENTITY, entityId: prepared.assessmentId, action: "RISK_TASK_ADDED", actor: user, changes: { task: reference, title: input.title.trim() }, meta }, tx);
      }
      await notifyOwner(tx, user, { id: row.id, reference, title: input.title.trim(), ownerId: input.ownerId! });
      return { id: row.id, reference };
    });
  },

  async update(id: string, input: TaskUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleTask(prisma, user, id);
    if (row.status === "COMPLETED") throw new BusinessRuleError("A completed task cannot be changed.", { blockers: ["The task is completed."] });
    if (!canEditTask(user, { ...placementOf(row), ownerId: row.ownerId })) throw new ForbiddenError();
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const parent = row.parentId ? await prisma.riskTask.findUnique({ where: { id: row.parentId }, select: taskSelect }) : null;
    const prepared = await prepareTask(prisma, user, { ...input, kind: row.kind }, parent, row);
    if (!canEditTask(user, { ...prepared.placement, ownerId: input.ownerId! })) throw new ForbiddenError("You cannot move tasks there.");
    await prisma.$transaction(async (tx) => {
      const data = {
        title: input.title.trim(),
        info: input.info,
        ownerId: input.ownerId!,
        createdOn: toDate(input.createdOn!),
        dueDate: toDate(input.dueDate!),
        programmeId: prepared.programmeId,
        assessmentId: prepared.assessmentId,
        hazardId: prepared.hazardId,
        factor: prepared.factor,
        originalValue: prepared.originalValue,
        targetValue: prepared.targetValue,
        ...prepared.placement,
      };
      const updated = await tx.riskTask.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      // Sub-tasks follow their parent's programme / assessment / hazard / placement.
      if (!row.parentId) {
        await tx.riskTask.updateMany({
          where: { parentId: id },
          data: { programmeId: prepared.programmeId, assessmentId: prepared.assessmentId, hazardId: prepared.hazardId, ...prepared.placement },
        });
      }
      await recordAudit(
        {
          entityType: TASK_ENTITY,
          entityId: id,
          action: TASK_AUDIT.UPDATED,
          actor: user,
          changes: {
            ...(row.ownerId !== input.ownerId ? { ownerId: { from: row.ownerId, to: input.ownerId } } : {}),
            ...(dateOnly(row.dueDate) !== input.dueDate ? { dueDate: { from: dateOnly(row.dueDate), to: input.dueDate } } : {}),
            ...(row.title !== input.title.trim() ? { title: { from: row.title, to: input.title.trim() } } : {}),
          },
          meta,
        },
        tx,
      );
      if (row.ownerId !== input.ownerId) await notifyOwner(tx, user, { id, reference: row.reference, title: input.title.trim(), ownerId: input.ownerId! });
    });
  },

  async start(id: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleTask(prisma, user, id);
    if (!canWorkOnTask(user, { ...placementOf(row), ownerId: row.ownerId })) throw new ForbiddenError();
    if (row.status !== "OPEN") throw new BusinessRuleError("Only an open task can be started.", { blockers: ["The task is not open."] });
    await prisma.$transaction(async (tx) => {
      const updated = await tx.riskTask.updateMany({ where: { id, version: expectedVersion, status: "OPEN" }, data: { status: "IN_PROGRESS", version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: TASK_ENTITY, entityId: id, action: TASK_AUDIT.STARTED, actor: user, meta }, tx);
    });
  },

  /**
   * Complete with a comment and a date between creation and today. Open sub-tasks block the parent.
   * A top-level scoring task needs an Approved assessment; it applies the achieved value to the
   * hazard factor, recalculates the assessment and records revision + 1 with the task reference.
   * The owner never changes (an administrator completes on the owner's behalf).
   */
  async complete(id: string, input: TaskCompleteInput, user: CurrentUser, meta: RequestMeta): Promise<{ rescored: boolean; revision: number | null; score: number | null }> {
    const row = await loadVisibleTask(prisma, user, id);
    if (!canWorkOnTask(user, { ...placementOf(row), ownerId: row.ownerId })) throw new ForbiddenError();
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const today = todayFor(user.timeZone);
    const scoring = isScoringTask(row);
    const assessment = row.assessmentId
      ? await prisma.riskAssessment.findUnique({ where: { id: row.assessmentId }, select: { id: true, reference: true, status: true, method: true, domain: true, rules: true, revision: true, currentScore: true } })
      : null;
    const factor = scoring && assessment ? findFactor(assessment.method as RiskMethod, assessment.domain, row.factor) : null;
    const openSubTasks = await prisma.riskTask.count({ where: { parentId: id, status: { not: "COMPLETED" } } });
    const blockers = completionBlockers({
      status: row.status,
      openSubTasks,
      comment: input.comment,
      completedOn: /^\d{4}-\d{2}-\d{2}$/.test(input.completedOn) ? input.completedOn : null,
      createdOn: dateOnly(row.createdOn)!,
      today,
      scoring,
      assessmentStatus: assessment?.status ?? null,
      actualValue: input.actualValue ?? null,
      factorRange: factor ? { label: factor.label, min: factor.min, max: factor.max } : null,
    });
    if (blockers.length) blocked("The task cannot be completed yet", blockers);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.riskTask.updateMany({
        where: { id, version: input.expectedVersion, status: { not: "COMPLETED" } },
        data: {
          status: "COMPLETED",
          completionComment: input.comment.trim(),
          completedOn: toDate(input.completedOn),
          completedAt: new Date(),
          completedById: user.id,
          actualValue: input.actualValue ?? null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      // Re-check inside the transaction: a sub-task completed/added concurrently or the assessment moved on.
      const stillOpen = await tx.riskTask.count({ where: { parentId: id, status: { not: "COMPLETED" } } });
      if (stillOpen) blocked("The task cannot be completed yet", [`Complete every sub-task first (${stillOpen} still open).`]);
      await recordAudit(
        { entityType: TASK_ENTITY, entityId: id, action: TASK_AUDIT.COMPLETED, actor: user, changes: { completedOn: input.completedOn, actualValue: input.actualValue ?? null, ownerId: row.ownerId }, metadata: { comment: input.comment.trim() }, meta },
        tx,
      );
      if (!scoring || !assessment || !factor) return { rescored: false, revision: null, score: null };

      const current = await tx.riskAssessment.findUnique({ where: { id: assessment.id }, select: { status: true, revision: true, version: true, currentScore: true } });
      if (current?.status !== "APPROVED") blocked("The task cannot be completed yet", ["Approve the current assessment revision before completing a task that changes its score."]);
      const method = assessment.method as RiskMethod;
      const rules = readRules(assessment.rules, method);
      const hazard = await tx.riskHazard.findUniqueOrThrow({ where: { id: row.hazardId! } });
      const before: HazardValues = { likelihood: hazard.likelihood, severity: hazard.severity, factors: hazard.factors as Record<string, number> | null, checklistResult: hazard.checklistResult };
      const after = applyFactor(method, assessment.domain, before, factor.key, input.actualValue!);
      const hazardScore = scoreHazard(method, assessment.domain, after);
      await tx.riskHazard.update({
        where: { id: hazard.id },
        data: {
          likelihood: after.likelihood ?? null,
          severity: after.severity ?? null,
          factors: after.factors ? json(after.factors) : Prisma.DbNull,
          checklistResult: (after.checklistResult as string | null | undefined) ?? null,
          score: hazardScore,
        },
      });
      const hazards = await tx.riskHazard.findMany({ where: { assessmentId: assessment.id }, orderBy: { sortOrder: "asc" } });
      const { score } = scoreAssessment(method, assessment.domain, hazards.map((h) => ({ ...h, factors: h.factors as Record<string, number> | null })));
      const band = classify(score, rules);
      const revision = nextRevision(current.revision);
      const original = factorValue(method, before, factor.key);
      await tx.riskRevision.create({
        data: {
          organizationId: requireTenantId(),
          assessmentId: assessment.id,
          revision,
          date: toDate(input.completedOn),
          action: "TASK_RESCORE",
          comment: `${input.comment.trim()} · ${factor.label} ${original ?? "—"} → ${input.actualValue}`,
          score,
          band,
          hazards: json(hazardSnapshot(hazards)),
          taskId: id,
          taskReference: row.reference,
          actorId: user.id,
          actorName: user.name,
        },
      });
      await tx.riskAssessment.update({ where: { id: assessment.id }, data: { revision, currentScore: score, band, version: { increment: 1 } } });
      await recordAudit(
        {
          entityType: ASSESSMENT_ENTITY,
          entityId: assessment.id,
          action: RISK_AUDIT.RESCORED,
          actor: user,
          changes: { revision: { from: current.revision, to: revision }, score: { from: current.currentScore, to: score }, [factor.key]: { from: original, to: input.actualValue } },
          metadata: { task: row.reference, comment: input.comment.trim() },
          meta,
        },
        tx,
      );
      return { rescored: true, revision, score };
    });
  },
};
