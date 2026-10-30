import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { SurveyAnswerInput, SurveyCommandInput, SurveyDefinitionInput, SurveyUpsertInput } from "@/lib/validation/document-surveys";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ConflictError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { localDate } from "@/server/modules/jobs/engine";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { audienceIncludesPrincipal, audiencePopulationWhere, audienceRowSelect, visibleDocumentsWhere, type AudienceRow } from "./document-access.policy";
import { DOCUMENT_AUDIT, DOCUMENT_ENTITY, DOCUMENT_VERSION_ENTITY } from "./document-audit-actions";
import { documentLink, forEachUserIdBatch, notifyUsers } from "./document-requirement";
import { SURVEY_AUDIT, SURVEY_NOTIFICATIONS } from "./survey-audit-actions";
import { surveyResultsService } from "./survey-results";
import {
  answerBlockReason,
  dateOnly,
  normaliseQuestions,
  questionsChanged,
  readerSurveyStatus,
  surveyDueDate,
  surveyEditProblem,
  surveyRequiredSince,
  surveyTransitionProblem,
  validateAnswers,
  type SurveyQuestionShape,
} from "./survey-rules";
import { currentSurveyWhere, effectiveDueDays, surveySettings } from "./survey-summary";
import type { DocumentSurveyManageDto, MySurveyDto, SurveyAnswerResult, SurveyDto, SurveyQuestionDto } from "./survey.dto";

/**
 * Document surveys (one current survey per document): create / edit with optimistic locking,
 * close / reopen / replace, answering (append-only, participation kept apart from the response),
 * reminders. Every change is audited in the same transaction. Results, participation and the CSV
 * export live in ./survey-results.ts and are re-exported here.
 */

export const questionSelect = { id: true, position: true, type: true, label: true, help: true, required: true, options: true } satisfies Prisma.DocumentSurveyQuestionSelect;

const surveyInclude = {
  questions: { select: questionSelect, orderBy: { position: "asc" } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { participations: true } },
} satisfies Prisma.DocumentSurveyInclude;

type SurveyRow = Prisma.DocumentSurveyGetPayload<{ include: typeof surveyInclude }>;

function shape(q: { type: SurveyQuestionShape["type"]; label: string; help: string | null; required: boolean; options: string[] }): SurveyQuestionShape {
  return { type: q.type, label: q.label, help: q.help, required: q.required, options: q.options };
}

function toQuestionDto(q: Prisma.DocumentSurveyQuestionGetPayload<{ select: typeof questionSelect }>): SurveyQuestionDto {
  return { id: q.id, position: q.position, type: q.type, label: q.label, help: q.help, required: q.required, options: q.options };
}

function cleanText(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

/** Named / anonymous response counts (no rows loaded). */
export async function responseCounts(db: DbClient, surveyId: string): Promise<{ named: number; anonymous: number }> {
  const groups = await db.documentSurveyResponse.groupBy({ by: ["isAnonymous"], where: { surveyId }, _count: { _all: true } });
  const count = (anonymous: boolean) => groups.find((g) => g.isAnonymous === anonymous)?._count._all ?? 0;
  return { named: count(false), anonymous: count(true) };
}

/** Serialises survey creation / replacement per document ("one survey per document"). */
async function lockDocumentSurveys(tx: Prisma.TransactionClient, documentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`document-survey:${documentId}`}, 0))`;
}

function definitionData(def: SurveyDefinitionInput) {
  return {
    title: def.title.trim(),
    intro: cleanText(def.intro),
    isMandatory: def.isMandatory,
    dueDays: def.isMandatory ? def.dueDays : null,
    allowAnonymous: def.allowAnonymous,
  };
}

/**
 * A survey's document carries the survey's title and introduction (the Survey page asks no document
 * details), so they change together. Titles stay unique among active documents and surveys.
 */
async function syncDocumentIdentity(tx: Prisma.TransactionClient, documentId: string, def: { title: string; intro: string | null }) {
  const clash = await tx.document.findFirst({
    where: { id: { not: documentId }, status: { not: "ARCHIVED" }, title: { equals: def.title, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) throw new ConflictError("An active document or response form with this title already exists.");
  await tx.document.update({ where: { id: documentId }, data: { title: def.title, description: def.intro } });
}

/** What the audit trail keeps about a definition. */
function definitionAudit(def: SurveyDefinitionInput) {
  const data = definitionData(def);
  return { ...data, questions: normaliseQuestions(def.questions).map((q) => ({ type: q.type, label: q.label, required: q.required, options: q.options })) };
}

/** Creates a survey with its questions inside the caller's transaction (also used by document create). */
export async function createSurveyRows(tx: Prisma.TransactionClient, documentId: string, def: SurveyDefinitionInput, actor: CurrentUser, now: Date) {
  const organizationId = actor.organizationId;
  return tx.documentSurvey.create({
    data: {
      organizationId,
      documentId,
      ...definitionData(def),
      mandatorySince: def.isMandatory ? now : null,
      createdById: actor.id,
      createdAt: now,
      questions: { createMany: { data: normaliseQuestions(def.questions).map((q, i) => ({ organizationId, position: i + 1, ...q })) } },
    },
    select: { id: true, isMandatory: true },
  });
}

export async function auditSurveyCreated(tx: Prisma.TransactionClient, documentId: string, surveyId: string, def: SurveyDefinitionInput, actor: CurrentUser, meta: RequestMeta) {
  await recordAudit(
    { entityType: DOCUMENT_ENTITY, entityId: documentId, action: SURVEY_AUDIT.CREATED, actor, changes: { survey: definitionAudit(def) }, metadata: { surveyId }, meta },
    tx,
  );
}

/** "New response form: <document>" to the whole audience (or the given people). */
export async function notifySurveyAudience(doc: { id: string; title: string; audiences: AudienceRow[] }, survey: { isMandatory: boolean }, where?: Prisma.UserWhereInput): Promise<number> {
  return notifyUsers(where ?? audiencePopulationWhere(doc.audiences), {
    type: survey.isMandatory ? SURVEY_NOTIFICATIONS.REQUIRED : SURVEY_NOTIFICATIONS.AVAILABLE,
    title: `New response form: ${doc.title}`,
    body: survey.isMandatory
      ? "Please complete it: read any file that comes with it and answer a few short questions."
      : "Open it and answer a few short questions – it only takes a minute.",
    link: documentLink(doc.id),
    entityType: DOCUMENT_ENTITY,
    entityId: doc.id,
  });
}

/** Called after a document is published: its survey (if any) goes live and the audience hears about it. */
export async function notifySurveyOnPublish(doc: { id: string; title: string; audiences: AudienceRow[] }): Promise<number> {
  const survey = await prisma.documentSurvey.findFirst({ where: { documentId: doc.id, status: "ACTIVE" }, select: { isMandatory: true } });
  return survey ? notifySurveyAudience(doc, survey) : 0;
}

async function loadDocument(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, title: true, status: true, publishedAt: true, currentVersionId: true, audiences: { select: audienceRowSelect } },
  });
  if (!doc) throw new NotFoundError();
  return doc;
}

async function loadCurrent(documentId: string): Promise<SurveyRow | null> {
  return prisma.documentSurvey.findFirst({ where: currentSurveyWhere(documentId), include: surveyInclude });
}

/** Surveys are only created on the Survey page, never added to an existing document. */
const NO_SURVEY = "This document has no response form. New response forms are created on Documents → Document Library → Create response form.";

function notArchived(doc: { status: string }) {
  if (doc.status === "ARCHIVED") throw new BusinessRuleError("Restore the response form before changing it.");
}

function toSurveyDto(row: SurveyRow, counts: { named: number; anonymous: number }, defaultDueDays: number): SurveyDto {
  const responseCount = counts.named + counts.anonymous;
  return {
    id: row.id,
    documentId: row.documentId,
    title: row.title,
    intro: row.intro,
    isMandatory: row.isMandatory,
    dueDays: row.dueDays,
    effectiveDueDays: row.dueDays ?? defaultDueDays,
    allowAnonymous: row.allowAnonymous,
    status: row.status,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    replacedAt: row.replacedAt?.toISOString() ?? null,
    questions: row.questions.map(toQuestionDto),
    participantCount: row._count.participations,
    responseCount,
    anonymousCount: counts.anonymous,
    questionsLocked: responseCount > 0,
    anonymityLocked: counts.anonymous > 0,
  };
}

async function isOpenedBy(userId: string, versionId: string): Promise<boolean> {
  const count = await prisma.auditLog.count({ where: { entityType: DOCUMENT_VERSION_ENTITY, entityId: versionId, actorId: userId, action: DOCUMENT_AUDIT.FILE_ACCESSED } });
  return count > 0;
}

export interface AnswerOptions {
  source: "ONLINE" | "OFFLINE_SYNC";
}

export const surveyService = {
  ...surveyResultsService,

  /** Creator view: current survey (with lock state) + previous (replaced) surveys. */
  async manageView(documentId: string): Promise<DocumentSurveyManageDto> {
    const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { status: true } });
    if (!doc) throw new NotFoundError();
    const [rows, settings] = await Promise.all([
      prisma.documentSurvey.findMany({ where: { documentId }, include: surveyInclude, orderBy: { createdAt: "desc" } }),
      surveySettings(),
    ]);
    const currentRow = rows.find((r) => r.status !== "REPLACED") ?? null;
    const current = currentRow ? toSurveyDto(currentRow, await responseCounts(prisma, currentRow.id), settings.defaultDueDays) : null;
    return {
      documentStatus: doc.status,
      current,
      previous: rows
        .filter((r) => r.status === "REPLACED")
        .map((r) => ({ id: r.id, title: r.title, createdAt: r.createdAt.toISOString(), replacedAt: r.replacedAt?.toISOString() ?? null, participantCount: r._count.participations })),
      settings,
    };
  },

  /**
   * Edit the document's survey (expectedVersion required). Surveys are only created on the Survey
   * page (`documentService.createSurvey`), never added to an existing document. Questions lock
   * once the first answer arrives; title, intro, mandatory, due days and anonymity off → on stay
   * editable.
   */
  async update(documentId: string, input: SurveyUpsertInput, actor: CurrentUser, meta: RequestMeta): Promise<{ id: string; version: number; notified: number }> {
    const doc = await loadDocument(documentId);
    notArchived(doc);
    const current = await loadCurrent(documentId);
    if (!current) throw new BusinessRuleError(NO_SURVEY);
    if (input.expectedVersion === undefined) throw new ConflictError("This document already has a response form. Reload to edit it.");
    const expectedVersion = input.expectedVersion;
    const next = definitionData(input.survey);
    const nextQuestions = normaliseQuestions(input.survey.questions);
    const changedQuestions = questionsChanged(current.questions.map(shape), nextQuestions);
    const mandatoryTurnedOn = next.isMandatory && !current.isMandatory;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Row lock first: a concurrent answer waits (it takes FOR SHARE on the survey row).
      const updated = await tx.documentSurvey.updateMany({
        where: { id: current.id, version: expectedVersion, status: { not: "REPLACED" } },
        data: { ...next, ...(mandatoryTurnedOn ? { mandatorySince: now } : {}), version: { increment: 1 } },
      });
      if (!updated.count) throw new StaleVersionError();
      const counts = await responseCounts(tx, current.id);
      const problem = surveyEditProblem({
        status: current.status,
        allowAnonymousBefore: current.allowAnonymous,
        allowAnonymousAfter: next.allowAnonymous,
        questionsChanged: changedQuestions,
        responseCount: counts.named + counts.anonymous,
        anonymousCount: counts.anonymous,
      });
      if (problem) throw new BusinessRuleError(problem);
      if (next.title !== current.title || next.intro !== current.intro) await syncDocumentIdentity(tx, documentId, next);
      if (changedQuestions) {
        await tx.documentSurveyQuestion.deleteMany({ where: { surveyId: current.id } });
        await tx.documentSurveyQuestion.createMany({
          data: nextQuestions.map((q, i) => ({ organizationId: actor.organizationId, surveyId: current.id, position: i + 1, ...q })),
        });
      }

      const changes: Record<string, unknown> = {};
      const track = (key: string, from: unknown, to: unknown) => {
        if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) changes[key] = { from: from ?? null, to: to ?? null };
      };
      track("surveyTitle", current.title, next.title);
      track("surveyIntro", current.intro, next.intro);
      track("surveyMandatory", current.isMandatory, next.isMandatory);
      track("surveyDueDays", current.dueDays, next.dueDays);
      track("surveyAnonymous", current.allowAnonymous, next.allowAnonymous);
      if (changedQuestions) changes.surveyQuestions = { from: current.questions.length, to: nextQuestions.length };
      if (Object.keys(changes).length) {
        await recordAudit({ entityType: DOCUMENT_ENTITY, entityId: documentId, action: SURVEY_AUDIT.UPDATED, actor, changes, metadata: { surveyId: current.id }, meta }, tx);
      }
    });

    let notified = 0;
    if (mandatoryTurnedOn && current.status === "ACTIVE" && doc.status === "PUBLISHED") {
      // Only people who have not answered yet are told that everyone must now answer.
      notified = await notifySurveyAudience(doc, { isMandatory: true }, {
        AND: [audiencePopulationWhere(doc.audiences), { documentSurveyParticipations: { none: { surveyId: current.id } } }],
      });
    }
    return { id: current.id, version: expectedVersion + 1, notified };
  },

  async setOpen(documentId: string, action: "close" | "reopen", input: SurveyCommandInput, actor: CurrentUser, meta: RequestMeta) {
    const doc = await loadDocument(documentId);
    notArchived(doc);
    const current = await loadCurrent(documentId);
    if (!current) throw new NotFoundError("This document has no response form.");
    const problem = surveyTransitionProblem(current.status, action);
    if (problem) throw new BusinessRuleError(problem);
    const status = action === "close" ? "CLOSED" : "ACTIVE";
    await prisma.$transaction(async (tx) => {
      const updated = await tx.documentSurvey.updateMany({
        where: { id: current.id, status: current.status, ...(input.expectedVersion !== undefined ? { version: input.expectedVersion } : {}) },
        data: { status, closedAt: action === "close" ? new Date() : null, version: { increment: 1 } },
      });
      if (!updated.count) throw new StaleVersionError();
      await recordAudit(
        {
          entityType: DOCUMENT_ENTITY,
          entityId: documentId,
          action: action === "close" ? SURVEY_AUDIT.CLOSED : SURVEY_AUDIT.REOPENED,
          actor,
          changes: { surveyStatus: { from: current.status, to: status } },
          metadata: { surveyId: current.id },
          meta,
        },
        tx,
      );
    });
    return { id: current.id, status };
  },

  /**
   * Replace survey: the current survey (and its answers) is kept read-only under "Previous surveys";
   * a new survey starts and everyone can answer it.
   */
  async replace(documentId: string, input: SurveyUpsertInput, actor: CurrentUser, meta: RequestMeta) {
    const doc = await loadDocument(documentId);
    notArchived(doc);
    const current = await loadCurrent(documentId);
    if (!current) throw new BusinessRuleError(NO_SURVEY);
    const now = new Date();
    const created = await prisma.$transaction(async (tx) => {
      await lockDocumentSurveys(tx, documentId);
      const updated = await tx.documentSurvey.updateMany({
        where: { id: current.id, status: { not: "REPLACED" }, ...(input.expectedVersion !== undefined ? { version: input.expectedVersion } : {}) },
        data: { status: "REPLACED", replacedAt: now, version: { increment: 1 } },
      });
      if (!updated.count) throw new StaleVersionError();
      await syncDocumentIdentity(tx, documentId, definitionData(input.survey));
      const survey = await createSurveyRows(tx, documentId, input.survey, actor, now);
      await recordAudit(
        {
          entityType: DOCUMENT_ENTITY,
          entityId: documentId,
          action: SURVEY_AUDIT.REPLACED,
          actor,
          changes: { survey: definitionAudit(input.survey) },
          metadata: { surveyId: survey.id, previousSurveyId: current.id },
          meta,
        },
        tx,
      );
      return survey;
    });
    const notified = doc.status === "PUBLISHED" ? await notifySurveyAudience(doc, created) : 0;
    return { id: created.id, previousId: current.id, notified };
  },

  /** Reader view of the document's current survey (null when it has none). */
  async mine(documentId: string, user: CurrentUser, now = new Date()): Promise<{ survey: MySurveyDto | null }> {
    const doc = await prisma.document.findFirst({
      where: { AND: [{ id: documentId }, visibleDocumentsWhere(user)] },
      select: { id: true, status: true, publishedAt: true, currentVersionId: true, audiences: { select: audienceRowSelect } },
    });
    if (!doc) throw new NotFoundError();
    const survey = await prisma.documentSurvey.findFirst({
      where: currentSurveyWhere(documentId),
      include: { questions: { select: questionSelect, orderBy: { position: "asc" } } },
    });
    if (!survey) return { survey: null };

    const [participation, settings, me, opened] = await Promise.all([
      prisma.documentSurveyParticipation.findUnique({ where: { surveyId_userId: { surveyId: survey.id, userId: user.id } }, select: { answeredAt: true } }),
      surveySettings(),
      prisma.user.findUnique({ where: { id: user.id }, select: { createdAt: true } }),
      // A survey without a file has nothing to open first.
      doc.currentVersionId ? isOpenedBy(user.id, doc.currentVersionId) : Promise.resolve(true),
    ]);
    // The reader's own receipt: participation without a named response = they chose anonymity.
    const named = participation ? await prisma.documentSurveyResponse.count({ where: { surveyId: survey.id, respondentId: user.id } }) : 0;
    const dueAt = survey.isMandatory
      ? surveyDueDate(
          surveyRequiredSince({ publishedAt: doc.publishedAt, mandatorySince: survey.mandatorySince, surveyCreatedAt: survey.createdAt, userCreatedAt: me?.createdAt }),
          effectiveDueDays(survey, settings),
        )
      : null;
    const myStatus = readerSurveyStatus({ surveyStatus: survey.status, isMandatory: survey.isMandatory, answered: Boolean(participation), dueAt, now });
    return {
      survey: {
        id: survey.id,
        title: survey.title,
        intro: survey.intro,
        isMandatory: survey.isMandatory,
        allowAnonymous: survey.allowAnonymous,
        status: survey.status,
        questions: survey.questions.map(toQuestionDto),
        myStatus,
        dueAt: dueAt && myStatus !== "ANSWERED" ? dueAt.toISOString() : null,
        assigned: doc.status === "PUBLISHED" && audienceIncludesPrincipal(doc.audiences, user),
        openedCurrentVersion: opened,
        answered: participation ? { answeredAt: participation.answeredAt.toISOString(), anonymous: named === 0 } : null,
      },
    };
  },

  /**
   * Submit answers. Guards: document visible, published and assigned; survey current and open;
   * the reader opened the version they answer on (current version when online) – unless the survey
   * has no file (no `versionId`; online only while the document still has none). Answers are final:
   * a second submit (double click, online + offline replay) returns the existing participation.
   *
   * Privacy: the response row (anonymous → no user id, date only, random uuid) and the
   * participation row ("who took part") are written without any link between them, and the audit
   * entry records participation only.
   */
  async answer(documentId: string, input: SurveyAnswerInput, user: CurrentUser, meta: RequestMeta, options: AnswerOptions = { source: "ONLINE" }): Promise<SurveyAnswerResult> {
    const doc = await prisma.document.findFirst({
      where: { AND: [{ id: documentId }, visibleDocumentsWhere(user)] },
      select: { id: true, status: true, currentVersionId: true, audiences: { select: audienceRowSelect } },
    });
    if (!doc) throw new NotFoundError();
    const survey = await prisma.documentSurvey.findFirst({ where: { id: input.surveyId, documentId }, select: { id: true, status: true, allowAnonymous: true } });
    if (!survey) throw new NotFoundError("Response form not found");

    const existing = await prisma.documentSurveyParticipation.findUnique({ where: { surveyId_userId: { surveyId: survey.id, userId: user.id } } });
    if (existing) return { surveyId: survey.id, created: false, answeredAt: existing.answeredAt.toISOString() };

    let version: { id: string; versionNumber: number } | null = null;
    if (input.versionId) {
      version = await prisma.documentVersion.findFirst({ where: { id: input.versionId, documentId }, select: { id: true, versionNumber: true } });
      if (!version) throw new NotFoundError("Version not found");
      if (options.source === "ONLINE" && version.id !== doc.currentVersionId) {
        throw new BusinessRuleError("A newer version of the file is available. Please open it before completing the response form.");
      }
    } else if (options.source === "ONLINE" && doc.currentVersionId) {
      // A file was added since the reader loaded the page.
      throw new BusinessRuleError("Please open the file before completing the response form.");
    }
    const block = answerBlockReason({
      documentStatus: doc.status,
      surveyStatus: survey.status,
      assigned: audienceIncludesPrincipal(doc.audiences, user),
      opened: version ? await isOpenedBy(user.id, version.id) : true,
      anonymousRequested: input.anonymous,
      allowAnonymous: survey.allowAnonymous,
    });
    if (block) throw new BusinessRuleError(block);

    const now = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        // Shared lock: questions cannot be replaced while this answer is being stored.
        await tx.$queryRaw`SELECT id FROM document_surveys WHERE id = ${survey.id} AND "organizationId" = ${user.organizationId} FOR SHARE`;
        const fresh = await tx.documentSurvey.findUnique({
          where: { id: survey.id },
          select: { status: true, allowAnonymous: true, questions: { select: questionSelect, orderBy: { position: "asc" } } },
        });
        if (!fresh || fresh.status !== "ACTIVE") throw new BusinessRuleError("This response form is closed.");
        if (input.anonymous && !fresh.allowAnonymous) throw new BusinessRuleError("This response form does not allow anonymous answers.");
        const checked = validateAnswers(fresh.questions, input.answers);
        if (!checked.ok) throw new ValidationError(checked.issues[0]!.message, checked.issues.map((i) => ({ path: `answers.${i.questionId}`, message: i.message })));

        await tx.documentSurveyParticipation.create({ data: { organizationId: user.organizationId, surveyId: survey.id, userId: user.id, answeredAt: now } });
        const responseId = randomUUID();
        await tx.documentSurveyResponse.create({
          data: {
            id: responseId,
            organizationId: user.organizationId,
            surveyId: survey.id,
            documentVersionNumber: version?.versionNumber ?? null,
            respondentId: input.anonymous ? null : user.id,
            isAnonymous: input.anonymous,
            submittedOn: dateOnly(localDate(now, user.timeZone)),
          },
        });
        if (checked.answers.length) {
          await tx.documentSurveyAnswer.createMany({
            data: checked.answers.map((a) => ({ id: randomUUID(), organizationId: user.organizationId, responseId, questionId: a.questionId, text: a.text, choices: a.choices })),
          });
        }
        await recordAudit(
          { entityType: DOCUMENT_ENTITY, entityId: documentId, action: SURVEY_AUDIT.ANSWERED, actor: user, metadata: { surveyId: survey.id, source: options.source }, meta },
          tx,
        );
      });
      return { surveyId: survey.id, created: true, answeredAt: now.toISOString() };
    } catch (error) {
      // A concurrent submit won the participation insert – answers are final, return that one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await prisma.documentSurveyParticipation.findUnique({ where: { surveyId_userId: { surveyId: survey.id, userId: user.id } } });
        if (winner) return { surveyId: survey.id, created: false, answeredAt: winner.answeredAt.toISOString() };
      }
      throw error;
    }
  },

  /** "Send reminder" to audience members who have not answered a mandatory, open survey (once per person per day). */
  async remind(documentId: string, actor: CurrentUser, meta: RequestMeta): Promise<{ notified: number }> {
    const doc = await loadDocument(documentId);
    const survey = await prisma.documentSurvey.findFirst({ where: currentSurveyWhere(documentId), select: { id: true, status: true, isMandatory: true } });
    if (!survey) throw new NotFoundError("This document has no response form.");
    if (doc.status !== "PUBLISHED" || survey.status !== "ACTIVE" || !survey.isMandatory) {
      throw new BusinessRuleError("Reminders can only be sent for a published, open response form that everyone must complete.");
    }
    const today = localDate(new Date(), actor.timeZone);
    const where: Prisma.UserWhereInput = { AND: [audiencePopulationWhere(doc.audiences), { documentSurveyParticipations: { none: { surveyId: survey.id } } }] };
    let notified = 0;
    await forEachUserIdBatch(where, async (ids) => {
      notified += await notificationService.notify({
        userIds: ids,
        type: SURVEY_NOTIFICATIONS.REMINDER,
        title: `Reminder: response form to complete – ${doc.title}`,
        body: "It only takes a minute. Open it, then press “Complete the response form”.",
        link: documentLink(doc.id),
        entityType: DOCUMENT_ENTITY,
        entityId: doc.id,
        dedupeKey: `${SURVEY_NOTIFICATIONS.REMINDER}:${survey.id}:${today}`,
      });
    });
    await recordAudit({ entityType: DOCUMENT_ENTITY, entityId: documentId, action: SURVEY_AUDIT.REMINDED, actor, metadata: { surveyId: survey.id, notified }, meta });
    return { notified };
  },
};
