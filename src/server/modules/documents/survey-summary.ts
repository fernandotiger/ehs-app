import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { DocumentSurveySettings } from "@/lib/settings/document-survey";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import { settingsService } from "@/server/modules/settings/settings.service";
import { assignedDocumentsWhere } from "./document-access.policy";
import { readerSurveyStatus, surveyDueDate, surveyRequiredSince, type MySurveyStatus } from "./survey-rules";
import type { MySurveySummaryDto, SurveySummaryDto } from "./survey.dto";

/**
 * Small survey read models shared by the document queries (library, My Documents), the due-work
 * provider and the survey service. A document's "current" survey is its one non-REPLACED survey.
 */

export function currentSurveyWhere(documentId?: string | { in: string[] }): Prisma.DocumentSurveyWhereInput {
  return { ...(documentId ? { documentId } : {}), status: { not: "REPLACED" } };
}

/**
 * Surveys and documents are listed apart (My Surveys / Survey Library vs My Documents / Document
 * Library): a "survey" is a document with a current survey – they are only created on the Survey page.
 */
export function surveyDocumentsWhere(isSurvey: boolean): Prisma.DocumentWhereInput {
  return isSurvey ? { surveys: { some: currentSurveyWhere() } } : { surveys: { none: currentSurveyWhere() } };
}

export function effectiveDueDays(survey: { dueDays: number | null }, settings: Pick<DocumentSurveySettings, "defaultDueDays">): number {
  return survey.dueDays ?? settings.defaultDueDays;
}

export async function surveySettings(db: DbClient = prisma): Promise<DocumentSurveySettings> {
  return settingsService.get("documentSurvey", db);
}

/** Current survey per document with its participant count ("Survey · 12 answers"). */
export async function surveySummaries(documentIds: string[]): Promise<Map<string, SurveySummaryDto>> {
  if (!documentIds.length) return new Map();
  const rows = await prisma.documentSurvey.findMany({
    where: currentSurveyWhere({ in: documentIds }),
    select: { id: true, documentId: true, title: true, status: true, isMandatory: true, _count: { select: { participations: true } } },
  });
  return new Map(
    rows.map((s) => [s.documentId, { id: s.id, title: s.title, status: s.status, isMandatory: s.isMandatory, participantCount: s._count.participations }]),
  );
}

const readerSurveySelect = {
  id: true,
  documentId: true,
  status: true,
  isMandatory: true,
  dueDays: true,
  mandatorySince: true,
  createdAt: true,
  document: { select: { publishedAt: true } },
} satisfies Prisma.DocumentSurveySelect;

type ReaderSurveyRow = Prisma.DocumentSurveyGetPayload<{ select: typeof readerSurveySelect }>;

function readerState(row: ReaderSurveyRow, answered: boolean, ctx: { settings: DocumentSurveySettings; userCreatedAt: Date; now: Date }): MySurveySummaryDto {
  const dueAt = row.isMandatory
    ? surveyDueDate(
        surveyRequiredSince({ publishedAt: row.document.publishedAt, mandatorySince: row.mandatorySince, surveyCreatedAt: row.createdAt, userCreatedAt: ctx.userCreatedAt }),
        effectiveDueDays(row, ctx.settings),
      )
    : null;
  const status: MySurveyStatus = readerSurveyStatus({ surveyStatus: row.status, isMandatory: row.isMandatory, answered, dueAt, now: ctx.now });
  return { id: row.id, status, dueAt: dueAt && status !== "ANSWERED" ? dueAt.toISOString() : null };
}

/** The reader's status for the current surveys of the given documents. */
export async function mySurveyStates(user: Pick<CurrentUser, "id">, documentIds: string[], ctx: { userCreatedAt: Date; now: Date }): Promise<Map<string, MySurveySummaryDto>> {
  if (!documentIds.length) return new Map();
  const [rows, settings] = await Promise.all([
    prisma.documentSurvey.findMany({ where: currentSurveyWhere({ in: documentIds }), select: readerSurveySelect }),
    surveySettings(),
  ]);
  if (!rows.length) return new Map();
  const answered = new Set(
    (await prisma.documentSurveyParticipation.findMany({ where: { userId: user.id, surveyId: { in: rows.map((r) => r.id) } }, select: { surveyId: true } })).map((p) => p.surveyId),
  );
  return new Map(rows.map((r) => [r.documentId, readerState(r, answered.has(r.id), { settings, ...ctx })]));
}

/**
 * Mandatory surveys the user still has to answer, across every document assigned to them
 * (bounded by the number of documents, not users). `includeOptional` adds open optional surveys
 * (My Surveys → "To answer").
 */
export async function surveysToAnswer(
  user: CurrentUser,
  ctx: { userCreatedAt: Date; now: Date },
  options: { includeOptional?: boolean } = {},
): Promise<(MySurveySummaryDto & { documentId: string })[]> {
  const [rows, settings] = await Promise.all([
    prisma.documentSurvey.findMany({
      where: {
        status: "ACTIVE",
        ...(options.includeOptional ? {} : { isMandatory: true }),
        document: assignedDocumentsWhere(user),
        participations: { none: { userId: user.id } },
      },
      select: readerSurveySelect,
    }),
    surveySettings(),
  ]);
  return rows.map((r) => ({ documentId: r.documentId, ...readerState(r, false, { settings, ...ctx }) }));
}
