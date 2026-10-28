import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { paginate } from "@/lib/validation/common";
import { ACKNOWLEDGEMENT_STATEMENT, type LibraryQuery, type MyDocumentsQuery, type MySurveysQuery } from "@/lib/validation/documents";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import { settingsService } from "@/server/modules/settings/settings.service";
import { acknowledgementStatus, dueDateFor, satisfiesRequirement, type AckSettingDefaults } from "./acknowledgement-rules";
import { assignedDocumentsWhere, audienceIncludesPrincipal, audienceRowSelect, visibleDocumentsWhere } from "./document-access.policy";
import { DOCUMENT_AUDIT, DOCUMENT_VERSION_ENTITY } from "./document-audit-actions";
import { audienceNamedSelect, iso, toAudienceSummary, toStatus, toVersionSummary, versionSummarySelect } from "./document-mappers";
import { buildRequirement, computeComplianceStats, requirementSelect, type RequirementDocument } from "./document-requirement";
import { documentTagsInclude, tagFilterWhere, tagSearchWhere, toTags } from "./document-tags";
import { isSurveyActionRequired } from "./survey-rules";
import { currentSurveyWhere, mySurveyStates, surveyDocumentsWhere, surveySummaries, surveysToAnswer } from "./survey-summary";
import type { MySurveySummaryDto, SurveySummaryDto } from "./survey.dto";
import type {
  AcknowledgementReceiptDto,
  DocumentViewerDto,
  LibraryItem,
  ManageDocumentDto,
  MyDocumentItem,
  MyDocumentsResponse,
  MySurveysResponse,
  VersionHistoryItem,
} from "./document.dto";

/** Read models for employees (My Documents, viewer) and for the document library. */

const myDocumentInclude = {
  category: { select: { id: true, name: true } },
  currentVersion: { select: versionSummarySelect },
  tags: documentTagsInclude,
} satisfies Prisma.DocumentInclude;

type MyDocumentRow = Prisma.DocumentGetPayload<{ include: typeof myDocumentInclude }>;

function searchWhere(q: string | undefined): Prisma.DocumentWhereInput {
  if (!q) return {};
  return {
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { referenceCode: { contains: q, mode: "insensitive" } },
      { category: { name: { contains: q, mode: "insensitive" } } },
      tagSearchWhere(q),
    ],
  };
}

interface AckRecord {
  id: string;
  versionId: string;
  versionNumber: number;
  acknowledgedAt: Date;
  clientAcknowledgedAt: Date | null;
  source: string;
  statement: string;
}

function toReceipt(ack: AckRecord | undefined): AcknowledgementReceiptDto | null {
  if (!ack) return null;
  return {
    id: ack.id,
    versionId: ack.versionId,
    versionNumber: ack.versionNumber,
    acknowledgedAt: ack.acknowledgedAt.toISOString(),
    clientAcknowledgedAt: iso(ack.clientAcknowledgedAt),
    source: ack.source,
    statement: ack.statement,
  };
}

/**
 * Per-user acknowledgement state for a set of documents. The inputs are bounded by the
 * number of documents (not users), so evaluating in memory is safe.
 */
function myStatusFor(
  row: { id: string; requiresAcknowledgement: boolean; ackRequiredFromVersion: number | null },
  ctx: { requirement: RequirementDocument | undefined; acks: AckRecord[]; userCreatedAt: Date; defaults: AckSettingDefaults; now: Date; assigned: boolean },
) {
  const req = ctx.requirement ? buildRequirement(ctx.requirement, ctx.defaults) : null;
  const latest = ctx.acks.filter((a) => satisfiesRequirement(a.versionNumber, row.ackRequiredFromVersion)).sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const dueAt = req?.since && row.requiresAcknowledgement ? dueDateFor(req.since, ctx.userCreatedAt, req.settings.ackDueDays) : null;
  const status = acknowledgementStatus({
    requiresAcknowledgement: row.requiresAcknowledgement,
    assigned: ctx.assigned,
    ackRequiredFromVersion: row.ackRequiredFromVersion,
    latestAcknowledgedVersion: latest?.versionNumber ?? null,
    dueAt,
    now: ctx.now,
  });
  return { status, dueAt, receipt: toReceipt(latest) };
}

function toMyItem(row: MyDocumentRow, state: ReturnType<typeof myStatusFor>, survey: MySurveySummaryDto | null = null): MyDocumentItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    referenceCode: row.referenceCode,
    category: row.category,
    tags: toTags(row.tags),
    status: toStatus(row.status),
    currentVersion: toVersionSummary(row.currentVersion),
    publishedAt: iso(row.publishedAt),
    updatedAt: row.updatedAt.toISOString(),
    requiresAcknowledgement: row.requiresAcknowledgement,
    ackStatus: state.status,
    dueAt: state.status === "acknowledged" || state.status === "not_required" ? null : iso(state.dueAt),
    acknowledgement: state.status === "acknowledged" ? state.receipt : null,
    survey,
  };
}

const ackRecordSelect = {
  id: true,
  documentId: true,
  versionId: true,
  versionNumber: true,
  acknowledgedAt: true,
  clientAcknowledgedAt: true,
  source: true,
  statement: true,
} satisfies Prisma.DocumentAcknowledgementSelect;

async function userCreatedAt(userId: string): Promise<Date> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!row) throw new NotFoundError();
  return row.createdAt;
}

const libraryInclude = {
  category: { select: { id: true, name: true } },
  currentVersion: { select: versionSummarySelect },
  audiences: { select: audienceNamedSelect },
  tags: documentTagsInclude,
} satisfies Prisma.DocumentInclude;

type LibraryRow = Prisma.DocumentGetPayload<{ include: typeof libraryInclude }>;

async function toLibraryItem(row: LibraryRow, requirement: RequirementDocument, defaults: AckSettingDefaults, now: Date, survey: SurveySummaryDto | null): Promise<LibraryItem> {
  return {
    id: row.id,
    title: row.title,
    referenceCode: row.referenceCode,
    category: row.category,
    tags: toTags(row.tags),
    status: toStatus(row.status),
    currentVersion: toVersionSummary(row.currentVersion),
    audience: toAudienceSummary(row.audiences),
    requiresAcknowledgement: row.requiresAcknowledgement,
    compliance: row.requiresAcknowledgement ? await computeComplianceStats(requirement, defaults, now) : null,
    survey,
    publishedAt: iso(row.publishedAt),
    archivedAt: iso(row.archivedAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function libraryStatusWhere(status: LibraryQuery["status"]): Prisma.DocumentWhereInput {
  switch (status) {
    case "ALL":
      return {};
    case "ACTIVE":
      return { status: { in: ["DRAFT", "PUBLISHED"] } };
    default:
      return { status };
  }
}

/**
 * The user's acknowledgement state across the assigned documents matching `assigned` (My Documents
 * or My Surveys): per-row status plus which ones are acknowledged / still to do / overdue.
 */
async function myAckState(user: CurrentUser, assigned: Prisma.DocumentWhereInput, now: Date) {
  const [defaults, createdAt, acks, requirementDocs, total] = await Promise.all([
    settingsService.get("system"),
    userCreatedAt(user.id),
    prisma.documentAcknowledgement.findMany({ where: { userId: user.id }, select: ackRecordSelect }),
    prisma.document.findMany({ where: { AND: [assigned, { requiresAcknowledgement: true }] }, select: requirementSelect }),
    prisma.document.count({ where: assigned }),
  ]);

  const acksByDoc = new Map<string, AckRecord[]>();
  for (const a of acks) acksByDoc.set(a.documentId, [...(acksByDoc.get(a.documentId) ?? []), a]);
  const reqById = new Map(requirementDocs.map((d) => [d.id, d]));

  const stateOf = (row: { id: string; requiresAcknowledgement: boolean; ackRequiredFromVersion: number | null }) =>
    myStatusFor(row, { requirement: reqById.get(row.id), acks: acksByDoc.get(row.id) ?? [], userCreatedAt: createdAt, defaults, now, assigned: true });

  const acknowledgedIds: string[] = [];
  const ackActionIds: string[] = [];
  const overdueIds = new Set<string>();
  for (const doc of requirementDocs) {
    const { status } = stateOf(doc);
    if (status === "acknowledged") acknowledgedIds.push(doc.id);
    else {
      ackActionIds.push(doc.id);
      if (status === "overdue") overdueIds.add(doc.id);
    }
  }
  return { createdAt, stateOf, total, acknowledgedIds, ackActionIds, overdueIds };
}

export const documentQueryService = {
  /** Same visibility specification as the API – lets pages return a real 404. */
  async canView(user: CurrentUser, id: string): Promise<boolean> {
    return (await prisma.document.count({ where: { AND: [{ id }, visibleDocumentsWhere(user)] } })) > 0;
  },

  async exists(id: string): Promise<boolean> {
    return (await prisma.document.count({ where: { id } })) > 0;
  },

  /** Surveys have their own management page (Survey Library) – used by the page routes to redirect. */
  async isSurvey(id: string): Promise<boolean> {
    return (await prisma.document.count({ where: { id, ...surveyDocumentsWhere(true) } })) > 0;
  },

  /** My Documents: published documents (not surveys – see My Surveys) assigned to the user, with my acknowledgement status. */
  async myDocuments(user: CurrentUser, query: MyDocumentsQuery, now = new Date()): Promise<MyDocumentsResponse> {
    const assigned: Prisma.DocumentWhereInput = { AND: [assignedDocumentsWhere(user), surveyDocumentsWhere(false)] };
    const { createdAt, stateOf, total, acknowledgedIds, ackActionIds, overdueIds } = await myAckState(user, assigned, now);
    const ackOverdue = overdueIds.size;
    // Surveys are listed in My Surveys; only the number still to answer is reported here (dashboard).
    const surveyTodo = (await surveysToAnswer(user, { userCreatedAt: createdAt, now })).filter((s) => isSurveyActionRequired(s.status));
    const actionIds = ackActionIds;

    const filterWhere: Prisma.DocumentWhereInput =
      query.filter === "action" ? { id: { in: actionIds } } : query.filter === "acknowledged" ? { id: { in: acknowledgedIds } } : {};
    const where: Prisma.DocumentWhereInput = {
      AND: [assigned, filterWhere, searchWhere(query.q), query.categoryId ? { categoryId: query.categoryId } : {}, tagFilterWhere(query.tagId)],
    };

    const [rows, filteredTotal] = await Promise.all([
      prisma.document.findMany({ where, include: myDocumentInclude, orderBy: [{ publishedAt: "desc" }, { title: "asc" }], ...paginate(query) }),
      prisma.document.count({ where }),
    ]);

    const surveys = await mySurveyStates(user, rows.map((r) => r.id), { userCreatedAt: createdAt, now });
    return {
      items: rows.map((row) => toMyItem(row, stateOf(row), surveys.get(row.id) ?? null)),
      total: filteredTotal,
      page: query.page,
      pageSize: query.pageSize,
      summary: {
        total,
        outstanding: ackActionIds.length,
        overdue: ackOverdue,
        acknowledged: acknowledgedIds.length,
        surveysToAnswer: surveyTodo.length,
        actionRequired: actionIds.length,
        actionOverdue: overdueIds.size,
      },
    };
  },

  /**
   * My Surveys: published surveys assigned to the user. "To answer" = open surveys I haven't answered
   * (mandatory or optional) plus any acknowledgement still to give on a survey's file.
   */
  async mySurveys(user: CurrentUser, query: MySurveysQuery, now = new Date()): Promise<MySurveysResponse> {
    const assigned: Prisma.DocumentWhereInput = { AND: [assignedDocumentsWhere(user), surveyDocumentsWhere(true)] };
    const { createdAt, stateOf, total, ackActionIds, overdueIds } = await myAckState(user, assigned, now);
    const [open, answered] = await Promise.all([
      surveysToAnswer(user, { userCreatedAt: createdAt, now }, { includeOptional: true }),
      prisma.documentSurveyParticipation.findMany({
        where: { userId: user.id, survey: { ...currentSurveyWhere(), document: assigned } },
        select: { survey: { select: { documentId: true } } },
      }),
    ]);
    for (const s of open) if (s.status === "OVERDUE") overdueIds.add(s.documentId);
    const todoIds = [...new Set([...ackActionIds, ...open.map((s) => s.documentId)])];
    const answeredIds = answered.map((p) => p.survey.documentId);

    const filterWhere: Prisma.DocumentWhereInput = query.filter === "todo" ? { id: { in: todoIds } } : query.filter === "answered" ? { id: { in: answeredIds } } : {};
    const where: Prisma.DocumentWhereInput = { AND: [assigned, filterWhere, searchWhere(query.q)] };
    const [rows, filteredTotal] = await Promise.all([
      prisma.document.findMany({ where, include: myDocumentInclude, orderBy: [{ publishedAt: "desc" }, { title: "asc" }], ...paginate(query) }),
      prisma.document.count({ where }),
    ]);
    const surveys = await mySurveyStates(user, rows.map((r) => r.id), { userCreatedAt: createdAt, now });
    return {
      items: rows.map((row) => toMyItem(row, stateOf(row), surveys.get(row.id) ?? null)),
      total: filteredTotal,
      page: query.page,
      pageSize: query.pageSize,
      summary: { total, toAnswer: todoIds.length, overdue: overdueIds.size, answered: answeredIds.length },
    };
  },

  /** Viewer detail. Outside the visibility policy → 404 (existence is not leaked). */
  async viewerDetail(user: CurrentUser, id: string, now = new Date()): Promise<DocumentViewerDto> {
    const doc = await prisma.document.findFirst({
      where: { AND: [{ id }, visibleDocumentsWhere(user)] },
      include: { ...myDocumentInclude, audiences: { select: audienceRowSelect } },
    });
    if (!doc) throw new NotFoundError();

    const assigned = doc.status === "PUBLISHED" && audienceIncludesPrincipal(doc.audiences, user);
    const [defaults, createdAt, acks, requirement, opened] = await Promise.all([
      settingsService.get("system"),
      userCreatedAt(user.id),
      prisma.documentAcknowledgement.findMany({ where: { userId: user.id, documentId: id }, select: ackRecordSelect }),
      prisma.document.findUnique({ where: { id }, select: requirementSelect }),
      doc.currentVersionId
        ? prisma.auditLog.count({
            where: { entityType: DOCUMENT_VERSION_ENTITY, entityId: doc.currentVersionId, actorId: user.id, action: DOCUMENT_AUDIT.FILE_ACCESSED },
          })
        : Promise.resolve(0),
    ]);

    const state = myStatusFor(doc, { requirement: requirement ?? undefined, acks, userCreatedAt: createdAt, defaults, now, assigned });
    const survey = assigned ? ((await mySurveyStates(user, [doc.id], { userCreatedAt: createdAt, now })).get(doc.id) ?? null) : null;
    const isSurvey = survey !== null || (await prisma.documentSurvey.count({ where: currentSurveyWhere(doc.id) })) > 0;
    return {
      ...toMyItem(doc, state, survey),
      assigned,
      isSurvey,
      openedCurrentVersion: opened > 0,
      requiredVersionNumber: doc.requiresAcknowledgement ? (doc.ackRequiredFromVersion ?? 1) : null,
      statement: ACKNOWLEDGEMENT_STATEMENT,
    };
  },

  /** Document Library / Survey Library (`type`) for managers / reporters, with per-document compliance counts. */
  async library(query: LibraryQuery, user: CurrentUser, now = new Date()) {
    const where: Prisma.DocumentWhereInput = {
      AND: [
        libraryStatusWhere(query.status),
        surveyDocumentsWhere(query.type === "survey"),
        searchWhere(query.q),
        query.categoryId ? { categoryId: query.categoryId } : {},
        tagFilterWhere(query.tagId),
        query.createdBy === "me" ? { createdById: user.id } : {},
      ],
    };
    const [rows, total, defaults] = await Promise.all([
      prisma.document.findMany({ where, include: libraryInclude, orderBy: [{ updatedAt: "desc" }], ...paginate(query) }),
      prisma.document.count({ where }),
      settingsService.get("system"),
    ]);
    const requirements = await prisma.document.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: requirementSelect });
    const reqById = new Map(requirements.map((r) => [r.id, r]));
    const surveys = await surveySummaries(rows.map((r) => r.id));
    const items: LibraryItem[] = [];
    // Sequential per document keeps the connection pool free for other requests.
    for (const row of rows) items.push(await toLibraryItem(row, reqById.get(row.id)!, defaults, now, surveys.get(row.id) ?? null));
    return { items, total, page: query.page, pageSize: query.pageSize };
  },

  async manageDetail(id: string, now = new Date()): Promise<ManageDocumentDto> {
    const row = await prisma.document.findUnique({
      where: { id },
      include: { ...libraryInclude, createdBy: { select: { id: true, name: true } }, _count: { select: { versions: true } } },
    });
    if (!row) throw new NotFoundError();
    const [requirement, defaults, surveys] = await Promise.all([
      prisma.document.findUnique({ where: { id }, select: requirementSelect }),
      settingsService.get("system"),
      surveySummaries([id]),
    ]);
    const item = await toLibraryItem(row, requirement!, defaults, now, surveys.get(id) ?? null);
    return {
      ...item,
      description: row.description,
      ackRequiredFromVersion: row.ackRequiredFromVersion,
      ackDueDays: row.ackDueDays,
      reminderIntervalDays: row.reminderIntervalDays,
      escalationDays: row.escalationDays,
      escalationTarget: row.escalationTarget,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      versionCount: row._count.versions,
    };
  },

  async versions(id: string): Promise<VersionHistoryItem[]> {
    const doc = await prisma.document.findUnique({ where: { id }, select: { currentVersionId: true } });
    if (!doc) throw new NotFoundError();
    const rows = await prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { versionNumber: "desc" },
      select: {
        ...versionSummarySelect,
        requiresReacknowledgement: true,
        uploadedBy: { select: { id: true, name: true } },
        _count: { select: { acknowledgements: true } },
      },
    });
    return rows.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      fileName: v.fileName,
      mimeType: v.mimeType,
      sizeBytes: v.sizeBytes,
      changeNote: v.changeNote,
      createdAt: v.createdAt.toISOString(),
      requiresReacknowledgement: v.requiresReacknowledgement,
      isCurrent: v.id === doc.currentVersionId,
      uploadedBy: v.uploadedBy,
      acknowledgementCount: v._count.acknowledgements,
    }));
  },
};
