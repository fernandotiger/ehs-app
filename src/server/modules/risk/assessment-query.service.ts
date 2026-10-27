import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { RISK_METHOD_LABELS, RISK_BAND_LABELS, RISK_DOMAIN_LABELS, type RiskBand, type RiskDomain, type RiskMethod } from "@/lib/risk/scoring";
import { ASSESSMENT_STATUS_LABELS, addDaysIso, type AssessmentStatus } from "@/lib/risk/labels";
import type { Paginated } from "@/lib/validation/common";
import type { AssessmentListQuery } from "@/lib/validation/risk";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import { formAvailableAtSite } from "@/server/modules/forms/form.service";
import { assessmentFacts, assessmentRecordSelect, type AssessmentRow } from "./assessment.service";
import { asAnswers, asSnapshot, checkRiskAnswers, readRules } from "./forms";
import type { AssessmentDetailDto, AssessmentListItem, AttentionItem, HazardSnapshot, RiskOverviewDto } from "./risk.dto";
import {
  assessmentVisibleWhere,
  canApproveAssessment,
  canArchiveAssessment,
  canCreateAssessmentAt,
  canCreateTaskAt,
  canEditAssessment,
  canReviewAssessment,
  programmeVisibleWhere,
  objectiveVisibleWhere,
  seesConfidentialFlag,
  taskVisibleWhere,
} from "./risk-access.policy";
import { ATTENTION_BANDS, classify } from "./scoring";
import { programmeProgress } from "./strategy";
import { ASSESSMENT_ENTITY, assessmentHref, csvName, csvResponse, dateOnly, iso, loadNames, placementOf, RELATED_KIND, taskHref, toDate, todayFor, type NameMaps } from "./support";
import { namesForTasks, taskListSelect, toTaskListItem } from "./task-query.service";
import { isReviewDue, isReviewOverdue, lifecycle, nextStep, submitBlockers, type AssessmentFacts } from "./workflow";

/** Assessment registers, detail, history, CSV export and the Risk overview. */

const listSelect = {
  id: true,
  reference: true,
  title: true,
  status: true,
  method: true,
  domain: true,
  currentScore: true,
  band: true,
  revision: true,
  reviewDate: true,
  ownerId: true,
  siteId: true,
  departmentId: true,
  isConfidential: true,
  rules: true,
  updatedAt: true,
  _count: { select: { hazards: true } },
} satisfies Prisma.RiskAssessmentSelect;

type ListRow = Prisma.RiskAssessmentGetPayload<{ select: typeof listSelect }>;

function noticeDays(rules: unknown, method: string): number {
  return readRules(rules, method).advanceNoticeDays;
}

function toListItem(user: CurrentUser, r: ListRow, names: NameMaps, today: string): AssessmentListItem {
  const reviewDate = dateOnly(r.reviewDate);
  return {
    id: r.id,
    reference: r.reference,
    title: r.title,
    status: r.status,
    method: r.method as RiskMethod,
    domain: r.domain,
    score: r.currentScore,
    band: (r.band as RiskBand | null) ?? null,
    revision: r.revision,
    reviewDate,
    reviewOverdue: isReviewOverdue(r.status, reviewDate, today),
    reviewDue: isReviewDue(r.status, reviewDate, noticeDays(r.rules, r.method), today),
    owner: r.ownerId ? { id: r.ownerId, name: names.users.get(r.ownerId) ?? "Unknown" } : null,
    siteName: r.siteId ? (names.sites.get(r.siteId) ?? null) : null,
    departmentName: r.departmentId ? (names.departments.get(r.departmentId) ?? null) : null,
    hazardCount: r._count.hazards,
    isConfidential: seesConfidentialFlag(user) ? r.isConfidential : null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function orderBy(q: Pick<AssessmentListQuery, "sort" | "dir">): Prisma.RiskAssessmentOrderByWithRelationInput[] {
  const dir = q.dir;
  switch (q.sort) {
    case "reference":
      return [{ reference: dir }];
    case "title":
      return [{ title: dir }];
    case "score":
      return [{ currentScore: { sort: dir, nulls: "last" } }, { reference: "asc" }];
    case "reviewDate":
      return [{ reviewDate: { sort: dir, nulls: "last" } }, { reference: "asc" }];
    case "status":
      return [{ status: dir }, { reference: "asc" }];
    default:
      return [{ updatedAt: dir }];
  }
}

/** Approved assessments whose review is due within their captured notice days (or overdue). */
async function dueReviewIds(db: DbClient, base: Prisma.RiskAssessmentWhereInput, today: string): Promise<string[]> {
  const rows = await db.riskAssessment.findMany({
    where: { AND: [base, { status: "APPROVED", reviewDate: { not: null, lte: toDate(addDaysIso(today, 365)) } }] },
    select: { id: true, reviewDate: true, rules: true, method: true, status: true },
    take: 5000,
  });
  return rows.filter((r) => isReviewDue(r.status, dateOnly(r.reviewDate), noticeDays(r.rules, r.method), today)).map((r) => r.id);
}

async function listWhere(user: CurrentUser, q: Omit<AssessmentListQuery, "page" | "pageSize" | "sort" | "dir">): Promise<Prisma.RiskAssessmentWhereInput> {
  const today = todayFor(user.timeZone);
  const and: Prisma.RiskAssessmentWhereInput[] = [assessmentVisibleWhere(user)];
  if (q.status === "ACTIVE") and.push({ status: { not: "ARCHIVED" } });
  else if (q.status !== "ALL") and.push({ status: q.status });
  if (q.siteId) and.push({ siteId: q.siteId });
  if (q.departmentId) and.push({ departmentId: q.departmentId });
  if (q.ownerId) and.push({ ownerId: q.ownerId });
  if (q.method) and.push({ method: q.method });
  if (q.band === "ATTENTION") and.push({ band: { in: ATTENTION_BANDS } });
  else if (q.band) and.push({ band: q.band });
  if (q.mine === "true") and.push({ OR: [{ ownerId: user.id }, { approverId: user.id }, { participantIds: { has: user.id } }] });
  if (q.review === "overdue") and.push({ status: "APPROVED", reviewDate: { lt: toDate(today) } });
  if (q.review === "due") and.push({ id: { in: await dueReviewIds(prisma, { AND: [...and] }, today) } });
  if (q.relatedTo) {
    const source = await prisma.riskAssessment.findUnique({ where: { id: q.relatedTo }, select: { siteId: true } });
    and.push({ id: { not: q.relatedTo }, siteId: source?.siteId ?? "__none__", status: { not: "ARCHIVED" } });
  }
  if (q.q) {
    and.push({
      OR: [
        { reference: { contains: q.q, mode: "insensitive" } },
        { title: { contains: q.q, mode: "insensitive" } },
        { itemIdentity: { contains: q.q, mode: "insensitive" } },
        { labelId: { equals: q.q.toUpperCase() } },
      ],
    });
  }
  return { AND: and };
}

/** Gate facts from the stored record (no throwing: deactivated people simply count as missing on submit). */
export async function storedFacts(db: DbClient, row: AssessmentRow): Promise<AssessmentFacts> {
  const snapshot = asSnapshot(row.form);
  const rules = readRules(row.rules, row.method);
  const [department, site] = await Promise.all([
    row.departmentId ? db.department.findUnique({ where: { id: row.departmentId }, select: { isActive: true } }) : null,
    row.siteId ? db.site.findUnique({ where: { id: row.siteId }, select: { name: true } }) : null,
  ]);
  let missing: string[] = [];
  if (snapshot) {
    try {
      const check = checkRiskAnswers(snapshot, asAnswers(row.answers));
      missing = [...check.missing, ...check.problems];
    } catch (error) {
      missing = [error instanceof Error ? error.message : "Some answers are not valid"];
    }
  }
  return {
    title: row.title,
    description: row.description,
    departmentId: row.departmentId,
    departmentValid: Boolean(department?.isActive),
    ownerId: row.ownerId,
    approverId: row.approverId,
    reviewDate: dateOnly(row.reviewDate),
    method: rules.method,
    domain: rules.domain,
    hazards: row.hazards.map((h) => ({ ...h, factors: h.factors as Record<string, number> | null })),
    missingAnswers: missing,
    formAvailable: formAvailableAtSite(rules as unknown as Record<string, unknown>, row.siteId),
    siteName: site?.name ?? null,
  };
}

const HISTORY_PAGE_MAX = 100;

export const assessmentQueryService = {
  async list(user: CurrentUser, q: AssessmentListQuery): Promise<Paginated<AssessmentListItem>> {
    const where = await listWhere(user, q);
    const [rows, total] = await Promise.all([
      prisma.riskAssessment.findMany({ where, select: listSelect, orderBy: orderBy(q), skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.riskAssessment.count({ where }),
    ]);
    const names = await loadNames(prisma, { users: rows.map((r) => r.ownerId), sites: rows.map((r) => r.siteId), departments: rows.map((r) => r.departmentId) });
    const today = todayFor(user.timeZone);
    return { items: rows.map((r) => toListItem(user, r, names, today)), total, page: q.page, pageSize: q.pageSize };
  },

  async export(user: CurrentUser, q: Omit<AssessmentListQuery, "page" | "pageSize">): Promise<Response> {
    const where = await listWhere(user, q);
    const rows = await prisma.riskAssessment.findMany({
      where,
      select: { ...listSelect, approverId: true, itemType: true, itemIdentity: true, operationMode: true, workArea: true, lastReviewedAt: true, hazards: { select: { name: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: orderBy(q),
      take: 10000,
    });
    const names = await loadNames(prisma, { users: rows.flatMap((r) => [r.ownerId, r.approverId]), sites: rows.map((r) => r.siteId), departments: rows.map((r) => r.departmentId) });
    const today = todayFor(user.timeZone);
    const confidential = seesConfidentialFlag(user);
    const header = ["Reference", "Title", "Status", "Revision", "Method", "Domain", "Score", "Risk level", "Site", "Department", "Responsible", "Approver", "Review date", "Review status", "Last reviewed", "Activity / item", "Operation mode", "Work area", "Hazards / aspects", ...(confidential ? ["Confidential"] : [])];
    const body = rows.map((r) => {
      const item = toListItem(user, r, names, today);
      return [
        r.reference,
        r.title,
        ASSESSMENT_STATUS_LABELS[r.status],
        r.revision,
        RISK_METHOD_LABELS[r.method as RiskMethod] ?? r.method,
        RISK_DOMAIN_LABELS[r.domain as RiskDomain] ?? r.domain,
        r.currentScore,
        r.band ? RISK_BAND_LABELS[r.band as RiskBand] : null,
        item.siteName,
        item.departmentName,
        r.ownerId ? (names.users.get(r.ownerId) ?? null) : null,
        r.approverId ? (names.users.get(r.approverId) ?? null) : null,
        item.reviewDate,
        item.reviewOverdue ? "Overdue" : item.reviewDue ? "Due" : r.status === "APPROVED" ? "Current" : "",
        dateOnly(r.lastReviewedAt),
        [r.itemType, r.itemIdentity].filter(Boolean).join(" · "),
        r.operationMode,
        r.workArea,
        r.hazards.map((h) => h.name).join("; "),
        ...(confidential ? [r.isConfidential] : []),
      ];
    });
    return csvResponse(csvName("risk-assessments"), [header, ...body]);
  },

  async detail(user: CurrentUser, id: string): Promise<AssessmentDetailDto> {
    const row = await prisma.riskAssessment.findFirst({
      where: { AND: [{ id }, assessmentVisibleWhere(user)] },
      select: {
        ...assessmentRecordSelect,
        submittedAt: true,
        approvedAt: true,
        approvedById: true,
        lastReviewedAt: true,
        clonedFromId: true,
        createdAt: true,
        updatedAt: true,
        revisions: { orderBy: { revision: "desc" } },
        reviews: { orderBy: [{ reviewDate: "desc" }, { createdAt: "desc" }] },
      },
    });
    if (!row) throw new NotFoundError();
    const today = todayFor(user.timeZone);
    const rules = readRules(row.rules, row.method);
    const snapshot = asSnapshot(row.form);
    const visible = assessmentVisibleWhere(user);

    const [taskRows, links, clonedFrom, facts] = await Promise.all([
      prisma.riskTask.findMany({ where: { AND: [{ assessmentId: id }, taskVisibleWhere(user)] }, select: taskListSelect, orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { dueDate: "asc" }] }),
      prisma.recordLink.findMany({
        where: { kind: RELATED_KIND, OR: [{ sourceType: ASSESSMENT_ENTITY, sourceId: id }, { targetType: ASSESSMENT_ENTITY, targetId: id }] },
        select: { sourceId: true, targetId: true },
      }),
      row.clonedFromId ? prisma.riskAssessment.findFirst({ where: { AND: [{ id: row.clonedFromId }, visible] }, select: { id: true, reference: true } }) : null,
      storedFacts(prisma, row),
    ]);
    const relatedIds = [...new Set(links.map((l) => (l.sourceId === id ? l.targetId : l.sourceId)))];
    const related = relatedIds.length
      ? await prisma.riskAssessment.findMany({ where: { AND: [{ id: { in: relatedIds } }, visible] }, select: { id: true, reference: true, title: true, status: true, currentScore: true, band: true }, orderBy: { reference: "asc" } })
      : [];
    const names = await loadNames(prisma, {
      users: [row.ownerId, row.approverId, row.approvedById, ...row.participantIds],
      sites: [row.siteId],
      locations: [row.locationId],
      departments: [row.departmentId],
    });
    const taskNames = await namesForTasks(prisma, taskRows);
    const recordFacts = assessmentFacts(row);
    const editable = row.status === "DRAFT" || row.status === "AWAITING_APPROVAL";
    const canEdit = canEditAssessment(user, recordFacts);
    const canApprove = canApproveAssessment(user, recordFacts);
    const canReview = canReviewAssessment(user, recordFacts);
    const canArchive = canArchiveAssessment(user, recordFacts);
    const openByHazard = new Map<string, number>();
    for (const t of taskRows) if (t.hazard && t.status !== "COMPLETED") openByHazard.set(t.hazard.id, (openByHazard.get(t.hazard.id) ?? 0) + 1);
    const reviewDate = dateOnly(row.reviewDate);
    const linkable = row.status !== "ARCHIVED" && (canEditAssessment(user, { ...recordFacts, status: "DRAFT" }) || row.ownerId === user.id);

    return {
      id: row.id,
      reference: row.reference,
      labelId: row.labelId,
      version: row.version,
      title: row.title,
      description: row.description,
      status: row.status,
      revision: row.revision,
      method: rules.method,
      domain: rules.domain,
      rules,
      form: {
        formId: snapshot?.formId ?? "",
        versionId: snapshot?.versionId ?? row.formVersionId,
        version: snapshot?.version ?? 0,
        name: snapshot?.name ?? "Risk form",
        fields: snapshot?.fields ?? [],
        siteId: snapshot?.siteId ?? null,
        capturedAt: snapshot?.capturedAt ?? row.createdAt.toISOString(),
      },
      answers: asAnswers(row.answers),
      placement: {
        ...placementOf(row),
        siteName: row.siteId ? (names.sites.get(row.siteId) ?? null) : null,
        locationName: row.locationId ? (names.locations.get(row.locationId) ?? null) : null,
        departmentName: row.departmentId ? (names.departments.get(row.departmentId) ?? null) : null,
      },
      owner: row.ownerId ? { id: row.ownerId, name: names.users.get(row.ownerId) ?? "Unknown" } : null,
      approver: row.approverId ? { id: row.approverId, name: names.users.get(row.approverId) ?? "Unknown" } : null,
      participants: row.participantIds.map((p) => ({ id: p, name: names.users.get(p) ?? "Unknown" })),
      reviewDate,
      itemType: row.itemType,
      itemIdentity: row.itemIdentity,
      operationMode: row.operationMode,
      workArea: row.workArea,
      peopleExposed: row.peopleExposed,
      impactContext: row.impactContext,
      score: row.currentScore,
      band: (row.band as RiskBand | null) ?? null,
      isConfidential: seesConfidentialFlag(user) ? row.isConfidential : null,
      hazards: row.hazards.map((h) => ({
        id: h.id,
        activity: h.activity,
        name: h.name,
        consequence: h.consequence,
        controls: h.controls,
        recommendation: h.recommendation,
        justification: h.justification,
        likelihood: h.likelihood,
        severity: h.severity,
        factors: (h.factors as Record<string, number> | null) ?? null,
        checklistResult: (h.checklistResult as HazardSnapshot["checklistResult"]) ?? null,
        score: h.score,
        band: classify(h.score, rules),
        openTasks: openByHazard.get(h.id) ?? 0,
      })),
      revisions: row.revisions.map((r) => ({
        id: r.id,
        revision: r.revision,
        date: dateOnly(r.date)!,
        action: r.action,
        comment: r.comment,
        score: r.score,
        band: (r.band as RiskBand | null) ?? null,
        hazards: (r.hazards as unknown as HazardSnapshot[]) ?? [],
        taskId: r.taskId,
        taskReference: r.taskReference,
        actorName: r.actorName,
      })),
      reviews: row.reviews.map((r) => ({
        id: r.id,
        reviewDate: dateOnly(r.reviewDate)!,
        comment: r.comment,
        nextReviewDate: dateOnly(r.nextReviewDate)!,
        reviewerName: r.reviewerName,
        revision: r.revision,
        score: r.score,
        createdAt: r.createdAt.toISOString(),
      })),
      related: related.map((r) => ({ id: r.id, reference: r.reference, title: r.title, status: r.status, score: r.currentScore, band: (r.band as RiskBand | null) ?? null })),
      clonedFrom,
      tasks: taskRows.map((t) => toTaskListItem(t, taskNames, today)),
      submittedAt: iso(row.submittedAt),
      approvedAt: iso(row.approvedAt),
      approvedByName: row.approvedById ? (names.users.get(row.approvedById) ?? null) : null,
      lastReviewedAt: dateOnly(row.lastReviewedAt),
      archivedAt: iso(row.archivedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      today,
      reviewOverdue: isReviewOverdue(row.status, reviewDate, today),
      reviewDue: isReviewDue(row.status, reviewDate, rules.advanceNoticeDays, today),
      nextStep: nextStep(row.status, { edit: canEdit && row.status !== "ARCHIVED", approve: canApprove, review: canReview, archive: canArchive }),
      lifecycle: lifecycle(row.status, row.revision),
      submitBlockers: editable ? submitBlockers(facts) : [],
      permissions: {
        edit: editable && canEdit,
        submit: row.status === "DRAFT" && canEdit,
        approve: editable && canApprove,
        review: row.status === "APPROVED" && canReview,
        revise: row.status === "APPROVED" && canEdit,
        archive: row.status !== "ARCHIVED" && canArchive,
        restore: row.status === "ARCHIVED" && canArchive,
        clone: canCreateAssessmentAt(user, recordFacts),
        createTask: row.status !== "ARCHIVED" && canCreateTaskAt(user, recordFacts),
        addEvidence: linkable,
        link: linkable,
        seeConfidential: seesConfidentialFlag(user),
      },
    };
  },

  async history(user: CurrentUser, id: string, page: number, pageSize: number) {
    const row = await prisma.riskAssessment.findFirst({ where: { AND: [{ id }, assessmentVisibleWhere(user)] }, select: { id: true } });
    if (!row) throw new NotFoundError();
    const where: Prisma.AuditLogWhereInput = { entityType: ASSESSMENT_ENTITY, entityId: id };
    const size = Math.min(pageSize, HISTORY_PAGE_MAX);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * size, take: size }),
      prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((e) => ({ id: e.id, entityType: e.entityType, action: e.action, actorName: e.actorName, changes: e.changes, metadata: e.metadata, createdAt: e.createdAt.toISOString() })),
      total,
      page,
      pageSize: size,
    };
  },

  /** Risk overview / Home KPIs: active assessments, high/critical, reviews due, overdue tasks … */
  async overview(user: CurrentUser): Promise<RiskOverviewDto> {
    const today = todayFor(user.timeZone);
    const todayDate = toDate(today);
    const visible = assessmentVisibleWhere(user);
    const active: Prisma.RiskAssessmentWhereInput = { AND: [visible, { status: { not: "ARCHIVED" } }] };
    const tasksVisible: Prisma.RiskTaskWhereInput = { AND: [taskVisibleWhere(user), { status: { not: "COMPLETED" } }] };
    const [activeCount, highCritical, awaiting, drafts, reviewsOverdue, dueIds, openTasks, overdueTasks, bands, recentRows, attentionRows, overdueTaskRows, objectives, programmeRows] = await Promise.all([
      prisma.riskAssessment.count({ where: active }),
      prisma.riskAssessment.count({ where: { AND: [active, { band: { in: ATTENTION_BANDS } }] } }),
      prisma.riskAssessment.count({ where: { AND: [visible, { status: "AWAITING_APPROVAL" }] } }),
      prisma.riskAssessment.count({ where: { AND: [visible, { status: "DRAFT" }] } }),
      prisma.riskAssessment.count({ where: { AND: [visible, { status: "APPROVED", reviewDate: { lt: todayDate } }] } }),
      dueReviewIds(prisma, visible, today),
      prisma.riskTask.count({ where: tasksVisible }),
      prisma.riskTask.count({ where: { AND: [tasksVisible, { dueDate: { lt: todayDate } }] } }),
      prisma.riskAssessment.groupBy({ by: ["band"], where: { AND: [active, { band: { not: null } }] }, _count: { _all: true } }),
      prisma.riskAssessment.findMany({ where: active, select: listSelect, orderBy: { updatedAt: "desc" }, take: 6 }),
      prisma.riskAssessment.findMany({
        where: { AND: [visible, { OR: [{ status: "AWAITING_APPROVAL" }, { status: "APPROVED", reviewDate: { lte: toDate(addDaysIso(today, 365)) } }] }] },
        select: { id: true, reference: true, title: true, status: true, reviewDate: true, rules: true, method: true, ownerId: true, approverId: true },
        orderBy: [{ reviewDate: "asc" }],
        take: 200,
      }),
      prisma.riskTask.findMany({ where: { AND: [tasksVisible, { dueDate: { lt: todayDate } }] }, select: { id: true, reference: true, title: true, dueDate: true, ownerId: true }, orderBy: { dueDate: "asc" }, take: 6 }),
      prisma.riskObjective.count({ where: { AND: [objectiveVisibleWhere(user), { status: "ACTIVE" }] } }),
      prisma.riskProgramme.findMany({ where: { AND: [programmeVisibleWhere(user), { status: { not: "COMPLETED" } }] }, select: { id: true, title: true, deadline: true, status: true, tasks: { select: { status: true } } }, orderBy: { deadline: "asc" }, take: 6 }),
    ]);
    const names = await loadNames(prisma, { users: [...recentRows.map((r) => r.ownerId), ...overdueTaskRows.map((t) => t.ownerId)], sites: recentRows.map((r) => r.siteId), departments: recentRows.map((r) => r.departmentId) });

    const attention: AttentionItem[] = [];
    for (const r of attentionRows) {
      const reviewDate = dateOnly(r.reviewDate);
      if (r.status === "AWAITING_APPROVAL") attention.push({ kind: "approval", id: r.id, reference: r.reference, title: r.title, detail: "Awaiting approval", due: null, href: assessmentHref(r.id) });
      else if (isReviewOverdue(r.status, reviewDate, today)) attention.push({ kind: "review-overdue", id: r.id, reference: r.reference, title: r.title, detail: "Periodic review overdue", due: reviewDate, href: assessmentHref(r.id) });
      else if (isReviewDue(r.status, reviewDate, noticeDays(r.rules, r.method), today)) attention.push({ kind: "review-due", id: r.id, reference: r.reference, title: r.title, detail: "Periodic review due", due: reviewDate, href: assessmentHref(r.id) });
    }
    for (const t of overdueTaskRows) {
      attention.push({ kind: "task-overdue", id: t.id, reference: t.reference, title: t.title, detail: `Task overdue · ${names.users.get(t.ownerId) ?? "Unknown"}`, due: dateOnly(t.dueDate), href: taskHref(t.id) });
    }
    const rank: Record<AttentionItem["kind"], number> = { "review-overdue": 0, "task-overdue": 1, approval: 2, "review-due": 3, draft: 4 };
    attention.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.due ?? "").localeCompare(b.due ?? ""));

    const bandOrder: RiskBand[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "ACTION_REQUIRED", "SATISFACTORY"];
    return {
      today,
      counts: {
        active: activeCount,
        highCritical,
        reviewsDue: dueIds.length,
        reviewsOverdue,
        awaitingApproval: awaiting,
        drafts,
        openTasks,
        overdueTasks,
        objectives,
        programmes: programmeRows.length,
      },
      byBand: bandOrder.map((b) => ({ label: RISK_BAND_LABELS[b], value: bands.find((x) => x.band === b)?._count._all ?? 0 })).filter((b) => b.value > 0),
      needsAttention: attention.slice(0, 10),
      recent: recentRows.map((r) => toListItem(user, r, names, today)),
      programmes: programmeRows.map((p) => ({ id: p.id, title: p.title, progress: programmeProgress(p.tasks.map((t) => t.status)), deadline: dateOnly(p.deadline)!, overdue: dateOnly(p.deadline)! < today })),
    };
  },

  /** QR / typed reference → the assessment (inside the signed-in user's company and access). */
  async resolveScan(user: CurrentUser, key: string) {
    const row = await prisma.riskAssessment.findFirst({
      where: { AND: [assessmentVisibleWhere(user), { OR: [{ reference: { equals: key, mode: "insensitive" } }, { labelId: key.toUpperCase() }] }] },
      select: { id: true, reference: true, title: true, status: true },
    });
    if (!row) throw new NotFoundError("No assessment you can open has this label.");
    const review = row.status === "APPROVED";
    return { id: row.id, reference: row.reference, title: row.title, status: row.status as AssessmentStatus, review, href: `${assessmentHref(row.id)}${review ? "?review=1" : ""}` };
  },
};
