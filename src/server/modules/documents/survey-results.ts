import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { paginate } from "@/lib/validation/common";
import type { SurveyParticipationQuery, SurveySelectQuery, SurveyTextAnswersQuery } from "@/lib/validation/document-surveys";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import { localDate } from "@/server/modules/jobs/engine";
import { requireTenantId } from "@/server/tenancy/context";
import { csvFileName, csvRow, csvStreamResponse } from "./csv";
import { audiencePopulationWhere, audienceRowSelect } from "./document-access.policy";
import { DOCUMENT_ENTITY } from "./document-audit-actions";
import { SURVEY_AUDIT } from "./survey-audit-actions";
import { anonymityNotice, percentOf, surveyExportCells, surveyExportHeader, visibleResponseCounts } from "./survey-rules";
import { currentSurveyWhere, surveySettings } from "./survey-summary";
import type { SurveyParticipationDto, SurveyResultsDto, SurveyTextAnswerDto } from "./survey.dto";

/**
 * Survey results for the document's creator / reporters. Everything is aggregated in SQL
 * (audiences can be 15k people) and the k-anonymity threshold is applied to every count, chart,
 * text list and export: anonymous answers are left out until at least k of them exist.
 * Nothing here returns who answered anonymously.
 */

const TEXT_PREVIEW = 5;
const EXPORT_BATCH = 500;

const resultQuestionSelect = { id: true, position: true, type: true, label: true, required: true, options: true } satisfies Prisma.DocumentSurveyQuestionSelect;

/** The requested survey of the document (default: the current one; previous surveys by id). */
async function resolveSurvey(documentId: string, surveyId?: string) {
  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, title: true, audiences: { select: audienceRowSelect } } });
  if (!doc) throw new NotFoundError();
  const survey = await prisma.documentSurvey.findFirst({
    where: surveyId ? { id: surveyId, documentId } : currentSurveyWhere(documentId),
    include: { questions: { select: resultQuestionSelect, orderBy: { position: "asc" } } },
  });
  if (!survey) throw new NotFoundError("This document has no response form.");
  return { doc, survey };
}

async function visibility(surveyId: string) {
  const [groups, settings] = await Promise.all([
    prisma.documentSurveyResponse.groupBy({ by: ["isAnonymous"], where: { surveyId }, _count: { _all: true } }),
    surveySettings(),
  ]);
  const count = (anonymous: boolean) => groups.find((g) => g.isAnonymous === anonymous)?._count._all ?? 0;
  const counts = { named: count(false), anonymous: count(true) };
  return { counts, threshold: settings.anonymityThreshold, ...visibleResponseCounts(counts, settings.anonymityThreshold) };
}

/** SQL fragment leaving anonymous responses out while they are below the threshold. */
function anonymousFilter(anonymousVisible: boolean) {
  return anonymousVisible ? Prisma.empty : Prisma.sql`AND r."isAnonymous" = false`;
}

function responseWhere(surveyId: string, anonymousVisible: boolean): Prisma.DocumentSurveyResponseWhereInput {
  return { surveyId, ...(anonymousVisible ? {} : { isAnonymous: false }) };
}

async function textAnswersPage(surveyId: string, questionId: string, anonymousVisible: boolean, page: { skip: number; take: number }) {
  const where: Prisma.DocumentSurveyAnswerWhereInput = { questionId, text: { not: null }, response: responseWhere(surveyId, anonymousVisible) };
  const [rows, total] = await Promise.all([
    prisma.documentSurveyAnswer.findMany({
      where,
      // Stable, non-chronological order (ids are random uuids): nothing reveals who answered when.
      orderBy: [{ text: "asc" }, { id: "asc" }],
      ...page,
      select: {
        text: true,
        response: { select: { isAnonymous: true, submittedOn: true, documentVersionNumber: true, respondent: { select: { id: true, name: true } } } },
      },
    }),
    prisma.documentSurveyAnswer.count({ where }),
  ]);
  const items: SurveyTextAnswerDto[] = rows.map((r) =>
    r.response.isAnonymous || !r.response.respondent
      ? { text: r.text ?? "", respondent: null, submittedOn: null, documentVersionNumber: null }
      : {
          text: r.text ?? "",
          respondent: r.response.respondent,
          submittedOn: r.response.submittedOn.toISOString().slice(0, 10),
          documentVersionNumber: r.response.documentVersionNumber,
        },
  );
  return { items, total };
}

function peopleFilters(query: { q?: string; departmentId?: string }): Prisma.UserWhereInput[] {
  const filters: Prisma.UserWhereInput[] = [];
  if (query.departmentId) filters.push({ departmentId: query.departmentId });
  if (query.q) {
    filters.push({
      OR: [
        { name: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
        { employeeNumber: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }
  return filters;
}

export const surveyResultsService = {
  /** Summary of the answers: participation, answer rate and per-question counts / text answers. */
  async results(documentId: string, query: SurveySelectQuery): Promise<SurveyResultsDto> {
    const { doc, survey } = await resolveSurvey(documentId, query.surveyId);
    const organizationId = requireTenantId();
    const vis = await visibility(survey.id);
    const population = audiencePopulationWhere(doc.audiences);
    const participated: Prisma.UserWhereInput = { documentSurveyParticipations: { some: { surveyId: survey.id } } };

    const [participants, audience, answeredInAudience] = await Promise.all([
      prisma.documentSurveyParticipation.count({ where: { surveyId: survey.id } }),
      prisma.user.count({ where: population }),
      prisma.user.count({ where: { AND: [population, participated] } }),
    ]);

    const choiceCounts = vis.visible
      ? await prisma.$queryRaw<{ questionId: string; choice: string; count: number }[]>`
          SELECT a."questionId" AS "questionId", c.choice AS choice, COUNT(*)::int AS count
          FROM document_survey_answers a
          JOIN document_survey_responses r ON r.id = a."responseId"
          CROSS JOIN LATERAL unnest(a.choices) AS c(choice)
          WHERE r."surveyId" = ${survey.id} AND r."organizationId" = ${organizationId} AND a."organizationId" = ${organizationId}
          ${anonymousFilter(vis.anonymousVisible)}
          GROUP BY a."questionId", c.choice`
      : [];
    const answeredCounts = vis.visible
      ? await prisma.$queryRaw<{ questionId: string; count: number }[]>`
          SELECT a."questionId" AS "questionId", COUNT(*)::int AS count
          FROM document_survey_answers a
          JOIN document_survey_responses r ON r.id = a."responseId"
          WHERE r."surveyId" = ${survey.id} AND r."organizationId" = ${organizationId} AND a."organizationId" = ${organizationId}
          ${anonymousFilter(vis.anonymousVisible)}
          GROUP BY a."questionId"`
      : [];

    const questions: SurveyResultsDto["questions"] = [];
    for (const q of survey.questions) {
      const answered = answeredCounts.find((r) => r.questionId === q.id)?.count ?? 0;
      const text = q.type === "TEXT" && vis.visible ? await textAnswersPage(survey.id, q.id, vis.anonymousVisible, { skip: 0, take: TEXT_PREVIEW }) : null;
      questions.push({
        id: q.id,
        position: q.position,
        type: q.type,
        label: q.label,
        required: q.required,
        answered,
        options:
          q.type === "TEXT"
            ? []
            : q.options.map((label) => {
                const count = choiceCounts.find((r) => r.questionId === q.id && r.choice === label)?.count ?? 0;
                return { label, count, percent: percentOf(count, answered) };
              }),
        textAnswers: text?.items ?? [],
      });
    }

    return {
      survey: {
        id: survey.id,
        title: survey.title,
        status: survey.status,
        isMandatory: survey.isMandatory,
        allowAnonymous: survey.allowAnonymous,
        createdAt: survey.createdAt.toISOString(),
        replacedAt: survey.replacedAt?.toISOString() ?? null,
      },
      totals: {
        participants,
        audience,
        answeredInAudience,
        answerRate: percentOf(answeredInAudience, audience),
        notAnswered: survey.isMandatory ? Math.max(0, audience - answeredInAudience) : null,
        shownResponses: vis.visible,
        namedResponses: vis.named,
        anonymousShown: vis.anonymous,
      },
      anonymity: { threshold: vis.threshold, hidden: vis.hiddenAnonymous, notice: anonymityNotice(vis.counts.anonymous, vis.threshold) },
      questions,
    };
  },

  /** "Show more" for a text question (paginated, alphabetical). */
  async textAnswers(documentId: string, query: SurveyTextAnswersQuery) {
    const { survey } = await resolveSurvey(documentId, query.surveyId);
    const question = survey.questions.find((q) => q.id === query.questionId);
    if (!question || question.type !== "TEXT") throw new ValidationError("Choose a text question of this response form.");
    const vis = await visibility(survey.id);
    if (!vis.visible) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    const { items, total } = await textAnswersPage(survey.id, question.id, vis.anonymousVisible, paginate(query));
    return { items, total, page: query.page, pageSize: query.pageSize };
  },

  /** Who has answered / not answered. Never says who answered anonymously. */
  async participation(documentId: string, query: SurveyParticipationQuery, viewer: Pick<CurrentUser, "timeZone">): Promise<SurveyParticipationDto> {
    const { doc, survey } = await resolveSurvey(documentId, query.surveyId);
    const population = audiencePopulationWhere(doc.audiences);
    const answered: Prisma.UserWhereInput = { documentSurveyParticipations: { some: { surveyId: survey.id } } };
    const notAnswered: Prisma.UserWhereInput = { AND: [population, { documentSurveyParticipations: { none: { surveyId: survey.id } } }] };
    const where: Prisma.UserWhereInput = { AND: [query.status === "answered" ? answered : notAnswered, ...peopleFilters(query)] };

    const [users, total, audience, answeredCount, notAnsweredCount] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        ...paginate(query),
        select: {
          id: true,
          name: true,
          email: true,
          department: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          documentSurveyParticipations: { where: { surveyId: survey.id }, select: { answeredAt: true }, take: 1 },
        },
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: population }),
      prisma.documentSurveyParticipation.count({ where: { surveyId: survey.id } }),
      prisma.user.count({ where: notAnswered }),
    ]);
    return {
      items: users.map((u) => {
        const at = u.documentSurveyParticipations[0]?.answeredAt;
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          department: u.department,
          location: u.location,
          // Day only – the exact time is not needed and would help timing guesses.
          answeredAt: at ? localDate(at, viewer.timeZone) : null,
        };
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      counts: { audience, answered: answeredCount, notAnswered: notAnsweredCount },
    };
  },

  /**
   * CSV of the answers: one row per shown response, one column per question. Anonymous rows say
   * "Anonymous" and carry no email, department, date or version, and are left out entirely while
   * below the threshold. Streamed in batches, CSV-injection safe, audited.
   */
  async exportCsv(documentId: string, query: SurveySelectQuery, actor: CurrentUser, meta: RequestMeta, now = new Date()): Promise<Response> {
    const { doc, survey } = await resolveSurvey(documentId, query.surveyId);
    const vis = await visibility(survey.id);
    await recordAudit({
      entityType: DOCUMENT_ENTITY,
      entityId: documentId,
      action: SURVEY_AUDIT.EXPORTED,
      actor,
      metadata: { surveyId: survey.id, rows: vis.visible, anonymousLeftOut: vis.hiddenAnonymous },
      meta,
    });

    const header = csvRow(surveyExportHeader(survey.questions));
    const where = responseWhere(survey.id, vis.anonymousVisible);
    let cursor: string | undefined;
    let done = !vis.visible;
    return csvStreamResponse(csvFileName(doc.title, "response-form-answers", now), header, async () => {
      if (done) return null;
      const rows = await prisma.documentSurveyResponse.findMany({
        where,
        // Named first; random uuids keep anonymous rows in a non-chronological order.
        orderBy: [{ isAnonymous: "asc" }, { id: "asc" }],
        take: EXPORT_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          isAnonymous: true,
          submittedOn: true,
          documentVersionNumber: true,
          respondent: { select: { name: true, email: true, department: { select: { name: true } } } },
          answers: { select: { questionId: true, text: true, choices: true } },
        },
      });
      if (rows.length < EXPORT_BATCH) done = true;
      if (!rows.length) return null;
      cursor = rows[rows.length - 1]!.id;
      return rows.map((r) => csvRow(surveyExportCells(r, survey.questions))).join("");
    });
  },
};
