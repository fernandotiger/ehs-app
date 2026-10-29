import "server-only";
import { COMPLIANCE_LABELS, SLAW_REQUIREMENT_ENTITY } from "@/lib/simplified-law";
import { actionAfterSave, actionCompleteBlockers, applicabilityBlockers, requirementBlockers } from "@/lib/simplified-law/rules";
import type { ApplicabilityInput, RequirementAssessInput, SlawActionCompleteInput } from "@/lib/validation/simplified-law";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ForbiddenError, NotFoundError, StaleVersionError } from "@/server/http/errors";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { canAssess, canCompleteAction, canViewRegister } from "./slaw-access.policy";
import { assertActiveUser, blocked, dateOnly, SLAW_AUDIT, SLAW_LEGISLATION_ENTITY, slawActionHref, slawLegislationHref, toDate, todayFor } from "./support";

/**
 * Storyboard steps 4 and 5: answer "Is it applicable to us?", assess each requirement and track the
 * action of a gap until it is done. Every change is audited in its own transaction; the action owner
 * is notified when an action is set, the person who set it when it is done.
 */

const lawName = (l: { shortTitle: string; title: string }) => l.shortTitle || l.title;

/** Closes every open action of a law (e.g. it no longer applies), with a note and an audit entry each. */
export async function closeOpenActions(tx: DbClient, legislationId: string, note: string, user: CurrentUser, meta?: RequestMeta): Promise<number> {
  const open = await tx.slawRequirement.findMany({ where: { legislationId, actionStatus: "OPEN" }, select: { id: true } });
  for (const r of open) {
    await tx.slawRequirement.update({
      where: { id: r.id },
      data: { actionStatus: "DONE", actionCompletedAt: new Date(), actionCompletedById: user.id, actionNote: note, version: { increment: 1 } },
    });
    await recordAudit({ entityType: SLAW_REQUIREMENT_ENTITY, entityId: r.id, action: SLAW_AUDIT.ACTION_CLOSED, actor: user, metadata: { note }, meta }, tx);
  }
  return open.length;
}

async function notifyOwner(db: DbClient, actor: CurrentUser, r: { id: string; ownerId: string; actionText: string; dueDate: string; law: string }) {
  if (r.ownerId === actor.id) return;
  await notificationService.notify(
    {
      userIds: [r.ownerId],
      type: "slaw.action.assigned",
      title: `${r.law} – a compliance action was given to you`,
      body: `${r.actionText} · due ${r.dueDate}`,
      link: slawActionHref(r.id),
      entityType: SLAW_REQUIREMENT_ENTITY,
      entityId: r.id,
      dedupeKey: `slaw.action.assigned:${r.id}:${r.ownerId}:${r.dueDate}`,
    },
    db,
  );
}

export const slawAssessmentService = {
  /** Saves the screening answers and (optionally) the decision "applies / does not apply". */
  async saveApplicability(id: string, input: ApplicabilityInput, user: CurrentUser, meta: RequestMeta): Promise<{ applicability: string; closedActions: number }> {
    if (!canViewRegister(user)) throw new NotFoundError();
    if (!canAssess(user)) throw new ForbiddenError("You cannot check applicability.");
    const law = await prisma.slawLegislation.findFirst({
      where: { id, archivedAt: null },
      select: { id: true, status: true, applicability: true, applicabilityReason: true, version: true, questions: { where: { archivedAt: null }, select: { id: true, answer: true, reason: true } } },
    });
    if (!law) throw new NotFoundError();
    const gates = applicabilityBlockers({ status: law.status, decision: input.decision, reason: input.reason });
    if (gates.length) blocked("The answers cannot be saved", gates);

    const known = new Map(law.questions.map((q) => [q.id, q]));
    const changedAnswers = input.answers.filter((a) => {
      const q = known.get(a.questionId);
      return q && (q.answer !== a.answer || q.reason !== a.reason.trim());
    });
    const decision = input.decision ?? law.applicability;
    const reason = input.decision ? input.reason.trim() : law.applicabilityReason;
    const decisionChanged = decision !== law.applicability || reason !== law.applicabilityReason;

    return prisma.$transaction(async (tx) => {
      const res = await tx.slawLegislation.updateMany({
        where: { id, version: law.version },
        data: {
          version: { increment: 1 },
          ...(decisionChanged ? { applicability: decision, applicabilityReason: reason, applicabilityById: user.id, applicabilityAt: new Date() } : {}),
        },
      });
      if (res.count === 0) throw new StaleVersionError();
      const now = new Date();
      for (const a of changedAnswers) {
        await tx.slawQuestion.update({ where: { id: a.questionId }, data: { answer: a.answer, reason: a.reason.trim(), answeredById: a.answer ? user.id : null, answeredAt: a.answer ? now : null } });
      }
      const closedActions = decisionChanged && decision === "DOES_NOT_APPLY" ? await closeOpenActions(tx, id, "Closed automatically – the law was marked as not applicable.", user, meta) : 0;
      if (changedAnswers.length || decisionChanged) {
        await recordAudit(
          {
            entityType: SLAW_LEGISLATION_ENTITY,
            entityId: id,
            action: SLAW_AUDIT.APPLICABILITY_SAVED,
            actor: user,
            changes: decisionChanged
              ? {
                  ...(decision !== law.applicability ? { applicability: { from: law.applicability, to: decision } } : {}),
                  ...(reason !== law.applicabilityReason ? { applicabilityReason: { from: law.applicabilityReason, to: reason } } : {}),
                }
              : null,
            metadata: { answersChanged: changedAnswers.length, closedActions },
            meta,
          },
          tx,
        );
      }
      return { applicability: decision, closedActions };
    });
  },

  /** One row of the requirements checklist: compliant? reason, and (when not compliant) the action. */
  async assessRequirement(id: string, input: RequirementAssessInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    if (!canViewRegister(user)) throw new NotFoundError();
    const row = await prisma.slawRequirement.findFirst({
      where: { id, archivedAt: null, legislation: { archivedAt: null } },
      include: { legislation: { select: { id: true, title: true, shortTitle: true, status: true, applicability: true } } },
    });
    if (!row) throw new NotFoundError();
    if (!canAssess(user)) throw new ForbiddenError("You cannot assess requirements.");
    if (row.legislation.status === "REPEALED") blocked("The requirement cannot be assessed", ["This law is repealed – there is nothing to check."]);
    if (row.legislation.applicability !== "APPLIES") blocked("The requirement cannot be assessed", ["First confirm that the law applies to us (step 3, Applicability)."]);

    const prev = {
      compliance: row.compliance,
      reason: row.reason,
      actionText: row.actionText,
      actionOwnerId: row.actionOwnerId,
      actionDueDate: dateOnly(row.actionDueDate),
      actionStatus: row.actionStatus,
    };
    const notCompliant = input.compliance === "NOT_COMPLIANT";
    const next = {
      compliance: input.compliance,
      reason: input.reason.trim(),
      // The action fields only count for "not compliant"; other answers keep the earlier action as history.
      actionText: notCompliant ? input.actionText.trim() : prev.actionText,
      actionOwnerId: notCompliant ? input.actionOwnerId : prev.actionOwnerId,
      actionDueDate: notCompliant ? input.actionDueDate : prev.actionDueDate,
    };
    const today = todayFor(user.timeZone);
    const gates = requirementBlockers(prev, next, today);
    if (gates.length) blocked("The requirement cannot be saved", gates);
    if (notCompliant && next.actionOwnerId !== prev.actionOwnerId) await assertActiveUser(prisma, next.actionOwnerId!, "who will do the action");
    const outcome = actionAfterSave(prev, next);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const res = await tx.slawRequirement.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          compliance: next.compliance,
          reason: next.reason,
          assessedById: user.id,
          assessedAt: now,
          actionText: next.actionText,
          actionOwnerId: next.actionOwnerId,
          actionDueDate: next.actionDueDate ? toDate(next.actionDueDate) : null,
          actionStatus: outcome.actionStatus,
          ...(outcome.opened ? { actionSetById: user.id, actionSetAt: now, actionCompletedAt: null, actionCompletedById: null, actionNote: "" } : {}),
          ...(outcome.closedNote ? { actionCompletedAt: now, actionCompletedById: user.id, actionNote: outcome.closedNote } : {}),
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw new StaleVersionError();
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of ["compliance", "reason", "actionText", "actionOwnerId", "actionDueDate"] as const) {
        if ((prev[key] ?? null) !== (next[key] ?? null)) changes[key] = { from: prev[key] ?? null, to: next[key] ?? null };
      }
      if (prev.actionStatus !== outcome.actionStatus) changes.actionStatus = { from: prev.actionStatus, to: outcome.actionStatus };
      await recordAudit(
        {
          entityType: SLAW_REQUIREMENT_ENTITY,
          entityId: id,
          action: SLAW_AUDIT.REQUIREMENT_ASSESSED,
          actor: user,
          changes,
          metadata: { law: lawName(row.legislation), compliance: COMPLIANCE_LABELS[next.compliance], ...(outcome.closedNote ? { note: outcome.closedNote } : {}) },
          meta,
        },
        tx,
      );
      if (outcome.opened && next.actionOwnerId && next.actionDueDate) {
        await notifyOwner(tx, user, { id, ownerId: next.actionOwnerId, actionText: next.actionText, dueDate: next.actionDueDate, law: lawName(row.legislation) });
      }
    });
  },

  /** The owner (or an assessor on their behalf) marks the action done; the requirement is flagged "check again". */
  async completeAction(id: string, input: SlawActionCompleteInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await prisma.slawRequirement.findFirst({
      where: { id, archivedAt: null, legislation: { archivedAt: null } },
      include: { legislation: { select: { id: true, title: true, shortTitle: true } } },
    });
    if (!row || (!canViewRegister(user) && row.actionOwnerId !== user.id)) throw new NotFoundError();
    if (!canCompleteAction(user, row)) throw new ForbiddenError(row.actionStatus === "OPEN" ? "Only the owner or an assessor can complete this action." : "This action is not open any more.");
    const gates = actionCompleteBlockers({ actionStatus: row.actionStatus, note: input.note });
    if (gates.length) blocked("The action cannot be completed", gates);
    await prisma.$transaction(async (tx) => {
      const res = await tx.slawRequirement.updateMany({
        where: { id, version: input.expectedVersion, actionStatus: "OPEN" },
        data: { actionStatus: "DONE", actionCompletedAt: new Date(), actionCompletedById: user.id, actionNote: input.note.trim(), version: { increment: 1 } },
      });
      if (res.count === 0) throw new StaleVersionError();
      await recordAudit(
        {
          entityType: SLAW_REQUIREMENT_ENTITY,
          entityId: id,
          action: SLAW_AUDIT.ACTION_COMPLETED,
          actor: user,
          changes: { actionStatus: { from: "OPEN", to: "DONE" } },
          metadata: { note: input.note.trim(), onBehalfOf: row.actionOwnerId !== user.id ? row.actionOwnerId : null },
          meta,
        },
        tx,
      );
      if (row.actionSetById && row.actionSetById !== user.id) {
        await notificationService.notify(
          {
            userIds: [row.actionSetById],
            type: "slaw.action.done",
            title: `${lawName(row.legislation)} – an action is done, check the requirement again`,
            body: row.actionText,
            link: slawLegislationHref(row.legislation.id, "requirements"),
            entityType: SLAW_REQUIREMENT_ENTITY,
            entityId: id,
          },
          tx,
        );
      }
    });
  },
};
