import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { pendingUploads, validateQuestionnaireAnswers, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import { OTHER_REGISTER } from "@/lib/law";
import type { LawEvaluationInput, LawExcludeInput, LawOtherCreateInput, LawOtherUpdateInput } from "@/lib/validation/law";
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
import { canConfirmReview, canEditProfile, canEvaluate, requirementVisibleWhere, type RequirementRecordFacts } from "./law-access.policy";
import { loadVisibleProfile } from "./profile.service";
import {
  asAnswers,
  asSnapshot,
  assertActiveUser,
  assertDepartmentAtSite,
  blocked,
  captureLawForm,
  dateOnly,
  json,
  LAW_AUDIT,
  placementOf,
  REQUIREMENT_ENTITY,
  requirementHref,
  toDate,
  todayFor,
} from "./support";
import { evaluationOutcome, evaluationSaveBlockers, exclusionBlockers, isEvaluationComplete, otherRequirementBlockers } from "./workflow";

/**
 * Requirement evaluations (relevance, narratives, rating, owner, department, next review, the
 * explicit content-change review) and company-specific "other requirements". Every save is
 * audited in its transaction (that audit trail is the evaluation history). Nothing here – nor a
 * completed task, incident or action – clears a review flag without the explicit confirmation.
 */

export const requirementSelect = {
  id: true,
  reference: true,
  kind: true,
  contentKey: true,
  title: true,
  register: true,
  category: true,
  requirementText: true,
  keywords: true,
  isRelevant: true,
  exclusionReason: true,
  relevanceNotes: true,
  evaluationNotes: true,
  rating: true,
  ownerId: true,
  nextReviewDate: true,
  evaluatedOn: true,
  reviewRequired: true,
  reviewReason: true,
  form: true,
  answers: true,
  version: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  profileId: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
  profile: { select: { id: true, name: true, ownerId: true, siteId: true, businessUnitId: true, jurisdiction: true, activities: true, contentVersion: true, showRating: true, archivedAt: true } },
} satisfies Prisma.LawRequirementSelect;

export type RequirementRow = Prisma.LawRequirementGetPayload<{ select: typeof requirementSelect }>;

export async function loadVisibleRequirement(db: DbClient, user: CurrentUser, id: string): Promise<RequirementRow> {
  const row = await db.lawRequirement.findFirst({ where: { AND: [{ id }, requirementVisibleWhere(user)] }, select: requirementSelect });
  if (!row) throw new NotFoundError();
  return row;
}

export const requirementFacts = (row: RequirementRow): RequirementRecordFacts => ({ ...placementOf(row), ownerId: row.ownerId, profileOwnerId: row.profile.ownerId });

/** Evaluating needs an active profile and (for company requirements) an active requirement. */
export function assertEditable(row: RequirementRow, what: string): void {
  if (row.profile.archivedAt) blocked(what, ["The profile is archived – restore it first."]);
  if (row.archivedAt) blocked(what, ["This company requirement is archived – restore it first."]);
}

/** Consumes uploads referenced by `file` answers as evidence on the requirement; answers keep the attachment ids. */
async function attachFileAnswers(tx: DbClient, user: CurrentUser, requirementId: string, snapshot: QuestionnaireSnapshot, answers: FormValues): Promise<FormValues> {
  const pending = pendingUploads(snapshot, answers);
  if (!pending.length) return answers;
  const out: FormValues = { ...answers };
  for (const item of pending) {
    const file = await uploadService.consume(item.uploadId, user, "evidence", tx);
    const row = await tx.attachment.create({
      data: {
        organizationId: user.organizationId,
        entityType: REQUIREMENT_ENTITY,
        entityId: requirementId,
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

/** Extra questions: required ones only once the evaluation is complete (partial saves stay possible). */
function checkAnswers(snapshot: QuestionnaireSnapshot, answers: FormValues, complete: boolean): FormValues {
  const check = validateQuestionnaireAnswers(snapshot, answers, { mode: complete ? "submit" : "draft" });
  if (!check.valid) {
    const labels = snapshot.fields.filter((f) => check.errors[f.key]).map((f) => f.label);
    throw new ValidationError(`Answer the extra questions: ${labels.join(", ")}.`, { fieldErrors: check.errors });
  }
  return check.data;
}

const changed = <T>(from: T, to: T) => (JSON.stringify(from) !== JSON.stringify(to) ? { from, to } : undefined);

export const lawRequirementService = {
  async saveEvaluation(id: string, input: LawEvaluationInput, user: CurrentUser, meta: RequestMeta): Promise<{ reviewConfirmed: boolean; complete: boolean }> {
    const row = await loadVisibleRequirement(prisma, user, id);
    const facts = requirementFacts(row);
    if (!canEvaluate(user, facts)) throw new ForbiddenError("You cannot check this requirement.");
    assertEditable(row, "The evaluation cannot be saved");
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const today = todayFor(user.timeZone);
    const evaluation = { ...input, rating: input.rating };
    const gates = evaluationSaveBlockers(evaluation, { isRelevant: row.isRelevant, reviewRequired: row.reviewRequired, today, currentNextReviewDate: dateOnly(row.nextReviewDate) });
    if (gates.length) blocked("The evaluation cannot be saved", gates);
    if (input.confirmReviewed && row.reviewRequired && !canConfirmReview(user, facts)) {
      throw new ForbiddenError("Only the responsible owner, the profile owner or someone who approves evaluations can confirm the review.");
    }
    if (input.departmentId && input.departmentId !== row.departmentId) await assertDepartmentAtSite(prisma, input.departmentId, row.profile.siteId);
    if (input.ownerId && input.ownerId !== row.ownerId) await assertActiveUser(prisma, input.ownerId, "who is responsible");
    const placement = input.departmentId ? await resolvePlacement({ departmentId: input.departmentId }) : await resolvePlacement({ siteId: row.profile.siteId });

    const complete = isEvaluationComplete(evaluation);
    let snapshot = asSnapshot(row.form);
    const capture = !snapshot && input.formVersionId ? await captureLawForm(prisma, input.formVersionId, row.profile.siteId) : null;
    snapshot = snapshot ?? capture;
    const answers = snapshot ? checkAnswers(snapshot, input.answers, complete) : null;
    const outcome = evaluationOutcome(evaluation, { reviewRequired: row.reviewRequired, evaluatedOn: dateOnly(row.evaluatedOn), today });

    await prisma.$transaction(async (tx) => {
      const stored = snapshot && answers ? await attachFileAnswers(tx, user, id, snapshot, answers) : null;
      const updated = await tx.lawRequirement.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          relevanceNotes: input.relevanceNotes,
          evaluationNotes: input.evaluationNotes,
          rating: input.rating,
          ownerId: input.ownerId,
          nextReviewDate: input.nextReviewDate ? toDate(input.nextReviewDate) : null,
          evaluatedOn: outcome.evaluatedOn ? toDate(outcome.evaluatedOn) : null,
          reviewRequired: outcome.reviewRequired,
          ...(outcome.reviewConfirmed ? { reviewReason: null } : {}),
          ...placement,
          ...(capture ? { formId: capture.formId, formVersionId: capture.versionId, form: json(capture) } : {}),
          ...(stored ? { answers: json(stored) } : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      const changes = Object.fromEntries(
        Object.entries({
          relevanceNotes: changed(row.relevanceNotes, input.relevanceNotes),
          evaluationNotes: changed(row.evaluationNotes, input.evaluationNotes),
          rating: changed(row.rating, input.rating),
          ownerId: changed(row.ownerId, input.ownerId),
          departmentId: changed(row.departmentId, placement.departmentId),
          nextReviewDate: changed(dateOnly(row.nextReviewDate), input.nextReviewDate),
          answers: stored && changed(asAnswers(row.answers), stored) ? "changed" : undefined,
        }).filter(([, v]) => v !== undefined),
      );
      await recordAudit(
        {
          entityType: REQUIREMENT_ENTITY,
          entityId: id,
          action: LAW_AUDIT.EVALUATION_SAVED,
          actor: user,
          changes,
          metadata: { status: complete ? "complete" : "partial", ...(capture ? { form: capture.name, formVersion: capture.version } : {}) },
          meta,
        },
        tx,
      );
      if (outcome.reviewConfirmed) {
        await recordAudit({ entityType: REQUIREMENT_ENTITY, entityId: id, action: LAW_AUDIT.REVIEW_CONFIRMED, actor: user, changes: { reviewRequired: { from: true, to: false } }, metadata: { reason: row.reviewReason }, meta }, tx);
      }
      if (input.ownerId && input.ownerId !== row.ownerId && input.ownerId !== user.id) {
        await notificationService.notify(
          {
            userIds: [input.ownerId],
            type: "law.requirement-owner",
            title: `${row.reference} – you are responsible for a legal requirement`,
            body: `${row.title} · ${row.profile.name}`,
            link: requirementHref(id),
            entityType: REQUIREMENT_ENTITY,
            entityId: id,
            dedupeKey: `law.requirement-owner:${id}:${input.ownerId}`,
          },
          tx,
        );
      }
    });
    return { reviewConfirmed: outcome.reviewConfirmed, complete };
  },

  /** "Doesn't apply to us" – needs a reason; narratives, rating, evidence, tasks and links are kept. */
  async exclude(id: string, input: LawExcludeInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleRequirement(prisma, user, id);
    if (!canEvaluate(user, requirementFacts(row))) throw new ForbiddenError();
    assertEditable(row, "The requirement cannot be changed");
    const gates = exclusionBlockers(input.reason);
    if (gates.length) blocked("The requirement cannot be marked as not applying", gates);
    if (!row.isRelevant) return;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.lawRequirement.updateMany({ where: { id, version: input.expectedVersion }, data: { isRelevant: false, exclusionReason: input.reason.trim(), version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: REQUIREMENT_ENTITY, entityId: id, action: LAW_AUDIT.EXCLUDED, actor: user, changes: { isRelevant: { from: true, to: false } }, metadata: { reason: input.reason.trim() }, meta }, tx);
    });
  },

  /** Applies again: the same saved evaluation comes back (nothing is reset). */
  async include(id: string, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleRequirement(prisma, user, id);
    if (!canEvaluate(user, requirementFacts(row))) throw new ForbiddenError();
    assertEditable(row, "The requirement cannot be changed");
    if (row.isRelevant) return;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.lawRequirement.updateMany({ where: { id, version: expectedVersion }, data: { isRelevant: true, exclusionReason: null, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: REQUIREMENT_ENTITY, entityId: id, action: LAW_AUDIT.INCLUDED, actor: user, changes: { isRelevant: { from: false, to: true } }, metadata: { previousReason: row.exclusionReason }, meta }, tx);
    });
  },

  // ── Company-specific requirements ─────────────────────────────────────────

  async createOther(input: LawOtherCreateInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string; reference: string }> {
    const profile = await loadVisibleProfile(prisma, user, input.profileId);
    if (!canEditProfile(user, profile)) throw new ForbiddenError("You cannot add requirements to this profile.");
    if (profile.archivedAt) blocked("The requirement cannot be added", ["The profile is archived – restore it first."]);
    const gates = otherRequirementBlockers(input);
    if (gates.length) blocked("The requirement cannot be added", gates);
    return prisma.$transaction(async (tx) => {
      const reference = await numberingService.next(tx, "legal-evaluation");
      const row = await tx.lawRequirement.create({
        data: {
          organizationId: requireTenantId(),
          profileId: profile.id,
          reference,
          kind: "OTHER",
          title: input.title.trim(),
          register: OTHER_REGISTER,
          category: input.category.trim(),
          requirementText: input.requirementText.trim(),
          keywords: input.keywords,
          businessUnitId: profile.businessUnitId,
          siteId: profile.siteId,
          createdById: user.id,
        },
        select: { id: true },
      });
      await recordAudit(
        { entityType: REQUIREMENT_ENTITY, entityId: row.id, action: LAW_AUDIT.REQUIREMENT_ADDED, actor: user, changes: { reference, title: input.title.trim(), category: input.category, profile: profile.name }, meta },
        tx,
      );
      return { id: row.id, reference };
    });
  },

  async updateOther(id: string, input: LawOtherUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleRequirement(prisma, user, id);
    if (row.kind !== "OTHER") throw new ValidationError("Only company requirements can be edited – legal content comes from the installed library.");
    if (!canEditProfile(user, { ...placementOf(row), ownerId: row.profile.ownerId })) throw new ForbiddenError();
    assertEditable(row, "The requirement cannot be changed");
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const gates = otherRequirementBlockers(input);
    if (gates.length) blocked("The requirement cannot be saved", gates);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.lawRequirement.updateMany({
        where: { id, version: input.expectedVersion },
        data: { title: input.title.trim(), requirementText: input.requirementText.trim(), category: input.category.trim(), keywords: input.keywords, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaleVersionError();
      const changes = Object.fromEntries(
        Object.entries({
          title: changed(row.title, input.title.trim()),
          requirementText: changed(row.requirementText, input.requirementText.trim()),
          category: changed(row.category, input.category.trim()),
          keywords: changed(row.keywords, input.keywords),
        }).filter(([, v]) => v !== undefined),
      );
      await recordAudit({ entityType: REQUIREMENT_ENTITY, entityId: id, action: LAW_AUDIT.REQUIREMENT_UPDATED, actor: user, changes, meta }, tx);
    });
  },

  async setOtherArchived(id: string, archived: boolean, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleRequirement(prisma, user, id);
    if (row.kind !== "OTHER") throw new ValidationError("Only company requirements can be archived.");
    if (!canEditProfile(user, { ...placementOf(row), ownerId: row.profile.ownerId })) throw new ForbiddenError();
    if (Boolean(row.archivedAt) === archived) return;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.lawRequirement.updateMany({ where: { id, version: expectedVersion }, data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: REQUIREMENT_ENTITY, entityId: id, action: archived ? LAW_AUDIT.REQUIREMENT_ARCHIVED : LAW_AUDIT.REQUIREMENT_RESTORED, actor: user, meta }, tx);
    });
  },
};

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
