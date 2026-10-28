import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatAnswer } from "@/lib/forms";
import {
  ACTION_STATE_LABELS,
  ANSWER_COLUMN_PREFIX,
  INCIDENT_STATUS_LABELS,
  INVESTIGATION_STATUS_LABELS,
  isStandardColumn,
  OPEN_INCIDENT_STATUSES,
  SEVERITY_LABELS,
  STANDARD_EXPORT_COLUMNS,
  type ActionStateKey,
  type IncidentStatusKey,
} from "@/lib/incidents";
import { PERMISSIONS } from "@/lib/permissions";
import { paginate, type Paginated } from "@/lib/validation/common";
import type { IncidentListQuery } from "@/lib/validation/incidents";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import type { CsvValue } from "@/server/modules/documents/csv";
import { settingsService } from "@/server/modules/settings/settings.service";
import { asAnswers, asSnapshot, checkAnswers, hiddenAnswerKeys } from "./forms";
import {
  canAddReportEvidence,
  canArchiveIncident,
  canCloseIncident,
  canEditReport,
  canInvestigate,
  canRaiseAction,
  canSeeConfidential,
  canSubmitReport,
  actionVisibleWhere,
  confidentialVisibleWhere,
  incidentVisibleWhere,
  isReporter,
  reportedByWhere,
} from "./incident-access.policy";
import { causeCatalogue, reporteeCatalogue } from "./incident-lookups";
import { recordFacts } from "./incident.service";
import type { ActionSummaryDto, IncidentDetailDto, IncidentListItem, IncidentOverviewDto, InvestigationDto, NamedRef } from "./incident.dto";
import { csvName, csvResponse, dateOnly, iso, loadNames, ref, todayFor, toDate, INCIDENT_ENTITY, INVESTIGATION_ENTITY, actionHref, incidentHref } from "./support";
import {
  closureBlockers,
  daysLost,
  deriveIncidentStatus,
  investigationCompletionBlockers,
  isActionOverdue,
  isActionResolved,
  lifecycle,
  nextStep,
  submitBlockers,
  type ActionNode,
} from "./workflow";

/** Read side of incidents: registers, detail, overview, export and history. */

const listInclude = {
  reporter: { select: { id: true, name: true } },
  investigators: { select: { userId: true, user: { select: { id: true, name: true } } } },
  investigation: { select: { status: true } },
  actions: { select: { action: { select: { state: true, archivedAt: true } } } },
} satisfies Prisma.IncidentInclude;

type ListRow = Prisma.IncidentGetPayload<{ include: typeof listInclude }>;

function dayStart(date: string): Date {
  return toDate(date);
}
function dayEnd(date: string): Date {
  return new Date(toDate(date).getTime() + 86_400_000);
}

export function incidentListWhere(user: CurrentUser, q: Omit<IncidentListQuery, "page" | "pageSize">): Prisma.IncidentWhereInput {
  const and: Prisma.IncidentWhereInput[] = [incidentVisibleWhere(user)];
  if (q.archived === "active") and.push({ archivedAt: null });
  else if (q.archived === "archived") and.push({ archivedAt: { not: null } });
  if (q.view === "investigations") and.push({ investigation: { isNot: null } });
  if (q.status === "ACTIVE_WORK") and.push({ status: { in: OPEN_INCIDENT_STATUSES } });
  else if (q.status) and.push({ status: q.status });
  if (q.investigationStatus === "OVERDUE") {
    and.push({
      isDraft: false,
      closedAt: null,
      investigationTargetDate: { lt: toDate(todayFor(user.timeZone)) },
      type: { investigationEnabled: true },
      OR: [{ investigation: { is: null } }, { investigation: { status: "IN_PROGRESS" } }],
    });
  } else if (q.investigationStatus) and.push({ investigation: { status: q.investigationStatus } });
  if (q.typeId) and.push({ typeId: q.typeId });
  if (q.subtypeId) and.push({ subtypeId: q.subtypeId });
  if (q.severity) and.push({ severity: q.severity });
  if (q.siteId) and.push({ siteId: q.siteId });
  if (q.departmentId) and.push({ departmentId: q.departmentId });
  if (q.ownerId) and.push({ OR: [{ investigators: { some: { userId: q.ownerId } } }, { investigation: { investigatorId: q.ownerId } }] });
  if (q.mine === "true") and.push({ OR: [...reportedByWhere(user), { investigators: { some: { userId: user.id } } }] });
  if (q.from) and.push({ occurredAt: { gte: dayStart(q.from) } });
  if (q.to) and.push({ occurredAt: { lt: dayEnd(q.to) } });
  if (q.q) {
    const contains = { contains: q.q, mode: "insensitive" as const };
    // Searchable custom answers are only matched where the user may read confidential details.
    and.push({ OR: [{ reference: contains }, { title: contains }, { AND: [{ searchText: contains }, confidentialVisibleWhere(user)] }] });
  }
  return { AND: and };
}

function orderBy(q: Pick<IncidentListQuery, "sort" | "dir">): Prisma.IncidentOrderByWithRelationInput[] {
  const dir = q.dir;
  switch (q.sort) {
    case "reference":
      return [{ reference: dir }];
    case "status":
      return [{ status: dir }, { occurredAt: "desc" }];
    case "severity":
      return [{ severity: dir }, { occurredAt: "desc" }];
    case "targetDate":
      return [{ investigationTargetDate: { sort: dir, nulls: "last" } }, { reference: "desc" }];
    case "updatedAt":
      return [{ updatedAt: dir }];
    case "title":
      return [{ title: dir }];
    default:
      return [{ occurredAt: { sort: dir, nulls: "last" } }, { createdAt: dir }];
  }
}

function toListItem(row: ListRow, names: Awaited<ReturnType<typeof loadNames>>, today: string): IncidentListItem {
  const actions = row.actions.map((a) => a.action).filter((a) => !a.archivedAt);
  const target = dateOnly(row.investigationTargetDate);
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    typeLabel: row.typeLabel,
    subtypeLabel: row.subtypeLabel,
    severity: row.severity,
    status: row.status,
    occurredAt: iso(row.occurredAt),
    submittedAt: iso(row.submittedAt),
    siteName: row.siteId ? (names.sites.get(row.siteId) ?? null) : null,
    departmentName: row.departmentId ? (names.departments.get(row.departmentId) ?? null) : null,
    reporter: row.reporter,
    isAnonymous: row.isAnonymous,
    investigators: row.investigators.map((i) => i.user),
    investigationStatus: row.investigation?.status ?? null,
    investigationTargetDate: target,
    investigationOverdue: Boolean(target && target < today && !row.isDraft && !row.closedAt && row.investigation?.status !== "COMPLETED"),
    isConfidential: row.isConfidential,
    archived: Boolean(row.archivedAt),
    openActions: actions.filter((a) => a.state === "OPEN" || a.state === "IN_PROGRESS" || a.state === "AWAITING_EFFECTIVENESS").length,
    totalActions: actions.length,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Action summaries (shared with the action read side) ─────────────────────

export const actionSummarySelect = {
  id: true,
  reference: true,
  description: true,
  kind: true,
  state: true,
  dueDate: true,
  plannedReviewDate: true,
  priority: true,
  parentActionId: true,
  siteId: true,
  departmentId: true,
  archivedAt: true,
  sourceType: true,
  sourceId: true,
  sourceKey: true,
  sourceLabel: true,
  sourceHref: true,
  owner: { select: { id: true, name: true } },
  reviewer: { select: { id: true, name: true } },
  incidents: { select: { incidentId: true } },
  tasks: { select: { done: true } },
} satisfies Prisma.CorrectiveActionSelect;

export type ActionSummaryRow = Prisma.CorrectiveActionGetPayload<{ select: typeof actionSummarySelect }>;

export function toNode(row: Pick<ActionSummaryRow, "id" | "reference" | "state" | "parentActionId" | "incidents">): ActionNode {
  return { id: row.id, reference: row.reference, state: row.state as ActionStateKey, parentActionId: row.parentActionId, incidentIds: row.incidents.map((i) => i.incidentId) };
}

export function toActionSummary(row: ActionSummaryRow, graph: readonly ActionNode[], today: string, names: Awaited<ReturnType<typeof loadNames>>): ActionSummaryDto {
  const dueDate = dateOnly(row.dueDate)!;
  const plannedReviewDate = dateOnly(row.plannedReviewDate);
  return {
    id: row.id,
    reference: row.reference,
    description: row.description,
    kind: row.kind,
    state: row.state,
    owner: row.owner,
    reviewer: row.reviewer,
    dueDate,
    plannedReviewDate,
    priority: row.priority,
    overdue: isActionOverdue({ state: row.state, dueDate, plannedReviewDate }, today),
    resolved: isActionResolved(toNode(row), graph),
    parentActionId: row.parentActionId,
    taskCount: row.tasks.length,
    tasksDone: row.tasks.filter((t) => t.done).length,
    incidentCount: row.incidents.length,
    siteName: row.siteId ? (names.sites.get(row.siteId) ?? null) : null,
    departmentName: row.departmentId ? (names.departments.get(row.departmentId) ?? null) : null,
    source: row.sourceType && row.sourceId ? { type: row.sourceType, id: row.sourceId, key: row.sourceKey, label: row.sourceLabel ?? row.sourceType, href: row.sourceHref } : null,
  };
}

// ── Detail ──────────────────────────────────────────────────────────────────

const detailInclude = {
  type: true,
  reporter: { select: { id: true, name: true } },
  people: { orderBy: { sortOrder: "asc" } },
  investigators: { select: { userId: true, user: { select: { id: true, name: true } } }, orderBy: { assignedAt: "asc" } },
  investigation: { include: { absences: { orderBy: { sortOrder: "asc" } }, investigator: { select: { id: true, name: true } } } },
  actions: { select: { action: { select: actionSummarySelect } }, orderBy: { linkedAt: "asc" } },
} satisfies Prisma.IncidentInclude;

type DetailRow = Prisma.IncidentGetPayload<{ include: typeof detailInclude }>;

async function investigationDto(row: NonNullable<DetailRow["investigation"]>, names: Awaited<ReturnType<typeof loadNames>>): Promise<InvestigationDto> {
  const [causes, reportees] = await Promise.all([causeCatalogue(prisma), reporteeCatalogue(prisma)]);
  const absences = row.absences.map((a) => {
    const startDate = dateOnly(a.startDate)!;
    const endDate = dateOnly(a.endDate)!;
    return { id: a.id, startDate, endDate, kind: a.kind, restricted: a.restricted, note: a.note, days: a.restricted ? 0 : daysLost([{ startDate, endDate, restricted: false }]) };
  });
  const form = asSnapshot(row.form);
  const answers = asAnswers(row.answers);
  let missing: string[] = [];
  if (form) {
    try {
      const check = checkAnswers(form, answers, "INVESTIGATION");
      missing = [...check.missing, ...check.problems];
    } catch {
      missing = ["Check the investigation answers."];
    }
  }
  const causeIds = row.causeIds;
  const reporteeIds = row.reporteeIds;
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    investigator: row.investigator,
    form,
    answers,
    hiddenAnswerKeys: hiddenAnswerKeys(form, "INVESTIGATION"),
    healthSafetyImpact: row.healthSafetyImpact,
    hazardGroup: row.hazardGroup,
    environmentalImpact: row.environmentalImpact,
    environmentalAspect: row.environmentalAspect,
    environmentalDescription: row.environmentalDescription,
    environmentalDuration: row.environmentalDuration,
    environmentalDurationUnit: (row.environmentalDurationUnit as InvestigationDto["environmentalDurationUnit"]) ?? null,
    causes: causeIds.map((id) => causes.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c)),
    reportable: row.reportable,
    reportees: reporteeIds.map((id) => reportees.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r)),
    absences,
    daysLost: daysLost(absences),
    operatingHoursLost: row.operatingHoursLost,
    actionsRequired: row.actionsRequired,
    closingDecision: row.closingDecision,
    startedAt: row.startedAt.toISOString(),
    completedAt: iso(row.completedAt),
    completedBy: ref(names.users, row.completedById),
    completionBlockers:
      row.status === "IN_PROGRESS"
        ? investigationCompletionBlockers({
            investigatorId: row.investigatorId,
            causeIds,
            closingDecision: row.closingDecision,
            actionsRequired: row.actionsRequired,
            healthSafetyImpact: row.healthSafetyImpact,
            hazardGroup: row.hazardGroup,
            environmentalImpact: row.environmentalImpact,
            environmentalAspect: row.environmentalAspect,
            environmentalDescription: row.environmentalDescription,
            environmentalDuration: row.environmentalDuration,
            reportable: row.reportable,
            reporteeIds,
            absences,
            operatingHoursLost: row.operatingHoursLost,
            missingAnswers: missing,
          })
        : [],
  };
}

export const incidentQueryService = {
  async list(user: CurrentUser, q: IncidentListQuery): Promise<Paginated<IncidentListItem>> {
    const where = incidentListWhere(user, q);
    const [rows, total] = await Promise.all([
      prisma.incident.findMany({ where, include: listInclude, orderBy: orderBy(q), ...paginate(q) }),
      prisma.incident.count({ where }),
    ]);
    const names = await loadNames(prisma, { sites: rows.map((r) => r.siteId), departments: rows.map((r) => r.departmentId) });
    const today = todayFor(user.timeZone);
    return { items: rows.map((r) => toListItem(r, names, today)), total, page: q.page, pageSize: q.pageSize };
  },

  async detail(user: CurrentUser, id: string): Promise<IncidentDetailDto> {
    const row = await prisma.incident.findFirst({ where: { AND: [{ id }, incidentVisibleWhere(user)] }, include: detailInclude });
    if (!row) throw new NotFoundError();
    const facts = recordFacts(row);
    const seeConfidential = canSeeConfidential(user, facts);
    const names = await loadNames(prisma, {
      users: [row.closedById, row.investigation?.completedById, ...row.notifyUserIds],
      sites: [row.siteId],
      locations: [row.locationId],
      departments: [row.departmentId, ...row.actions.map((a) => a.action.departmentId)],
    });
    const today = todayFor(user.timeZone);
    const actionRows = row.actions.map((a) => a.action).filter((a) => !a.archivedAt);
    const graph = actionRows.map(toNode);
    const investigation = row.investigation ? await investigationDto(row.investigation, names) : null;
    const reportForm = asSnapshot(row.reportForm);
    const workflowFacts = {
      isDraft: row.isDraft,
      closed: Boolean(row.closedAt),
      investigation: row.investigation ? { status: row.investigation.status, actionsRequired: row.investigation.actionsRequired } : null,
      actions: graph,
    };
    const status = deriveIncidentStatus(workflowFacts) as IncidentStatusKey;

    let draftGates: string[] = [];
    if (row.isDraft && reportForm) {
      let missing: string[] = [];
      try {
        const check = checkAnswers(reportForm, asAnswers(row.answers), "REPORT");
        // Title, date and site questions are covered by their own gates (the controls fill them).
        const covered = new Set(reportForm.fields.filter((f) => ["incidentTitle", "occurredAt", "site"].includes(f.key)).map((f) => f.label));
        missing = [...check.missing.filter((label) => !covered.has(label)), ...check.problems];
      } catch {
        missing = ["Check the answers to the report questions."];
      }
      draftGates = submitBlockers({
        title: row.title,
        occurredAt: iso(row.occurredAt),
        departmentId: row.departmentId,
        investigationTargetDate: dateOnly(row.investigationTargetDate),
        typeActive: row.type.isActive,
        typeHasSubtypes: true,
        subtypeId: row.subtypeId,
        subtypeValid: true,
        people: row.people,
        investigatorCount: row.investigators.length,
        assignmentRequired: row.type.assignmentRequired,
        multipleInvestigators: row.type.multipleInvestigators,
        missingAnswers: missing,
      });
    }

    return {
      id: row.id,
      reference: row.reference,
      version: row.version,
      title: row.title,
      narrative: seeConfidential ? row.narrative : null,
      confidentialHidden: !seeConfidential,
      type: {
        id: row.type.id,
        key: row.type.key,
        name: row.type.name,
        isActive: row.type.isActive,
        investigationEnabled: row.type.investigationEnabled,
        investigationRequired: row.type.investigationRequired,
        multipleInvestigators: row.type.multipleInvestigators,
        assignmentRequired: row.type.assignmentRequired,
        attachmentsAllowed: row.type.attachmentsAllowed,
        targetDays: row.type.targetDays,
      },
      typeLabel: row.typeLabel,
      subtype: row.subtypeLabel ? { id: row.subtypeId, label: row.subtypeLabel } : null,
      severity: row.severity,
      status,
      placement: {
        businessUnitId: row.businessUnitId,
        siteId: row.siteId,
        locationId: row.locationId,
        departmentId: row.departmentId,
        siteName: row.siteId ? (names.sites.get(row.siteId) ?? null) : null,
        locationName: row.locationId ? (names.locations.get(row.locationId) ?? null) : null,
        departmentName: row.departmentId ? (names.departments.get(row.departmentId) ?? null) : null,
      },
      preciseLocation: row.preciseLocation,
      shift: row.shift,
      occurredAt: iso(row.occurredAt),
      investigationTargetDate: dateOnly(row.investigationTargetDate),
      isConfidential: row.isConfidential,
      isDraft: row.isDraft,
      submittedAt: iso(row.submittedAt),
      reporter: row.reporter,
      isAnonymous: row.isAnonymous,
      reportedByMe: isReporter(user, facts),
      immediateAction: seeConfidential ? row.immediateAction : null,
      firstAid: seeConfidential ? row.firstAid : null,
      nurseNotified: row.nurseNotified,
      notifyUsers: row.notifyUserIds.map((uid) => ref(names.users, uid)!).filter(Boolean),
      investigators: row.investigators.map((i) => i.user),
      people: seeConfidential
        ? row.people.map((p) => ({
            id: p.id,
            name: p.name,
            userId: p.userId,
            personType: p.personType as IncidentDetailDto["people"][number]["personType"],
            involvement: p.involvement as IncidentDetailDto["people"][number]["involvement"],
            injuryDetails: p.injuryDetails,
            injuryType: p.injuryType,
            bodyPart: p.bodyPart,
          }))
        : [],
      reportForm,
      answers: seeConfidential ? asAnswers(row.answers) : {},
      hiddenAnswerKeys: hiddenAnswerKeys(reportForm, "REPORT"),
      closedAt: iso(row.closedAt),
      closedBy: ref(names.users, row.closedById),
      closureNote: row.closureNote,
      archivedAt: iso(row.archivedAt),
      source: row.sourceType && row.sourceId ? { type: row.sourceType, id: row.sourceId, key: row.sourceKey, label: row.sourceLabel ?? row.sourceType, href: row.sourceHref } : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      investigation: investigation && !seeConfidential ? { ...investigation, answers: {}, absences: investigation.absences.map((a) => ({ ...a, note: null })) } : investigation,
      actions: actionRows.map((a) => toActionSummary(a, graph, today, names)),
      daysLost: investigation?.daysLost ?? 0,
      lifecycle: lifecycle({ ...workflowFacts, investigationEnabled: row.type.investigationEnabled }),
      nextStep: nextStep(status, { investigationEnabled: row.type.investigationEnabled }),
      closureBlockers: closureBlockers({ ...workflowFacts, investigationRequired: row.type.investigationRequired }, { ignoreNote: true }),
      submitBlockers: draftGates,
      permissions: {
        edit: canEditReport(user, facts),
        submit: canSubmitReport(user, facts),
        archive: canArchiveIncident(user, facts),
        investigate: canInvestigate(user, facts),
        close: canCloseIncident(user, facts),
        raiseAction: canRaiseAction(user, facts),
        seeConfidential,
        addEvidence: row.type.attachmentsAllowed && canAddReportEvidence(user, facts),
      },
    };
  },

  /** Signed audit trail of the incident (report, investigation, actions linked, evidence). */
  async history(user: CurrentUser, id: string, page: number, pageSize: number) {
    const row = await prisma.incident.findFirst({ where: { AND: [{ id }, incidentVisibleWhere(user)] }, select: { id: true, investigation: { select: { id: true } } } });
    if (!row) throw new NotFoundError();
    const where: Prisma.AuditLogWhereInput = {
      OR: [{ entityType: INCIDENT_ENTITY, entityId: id }, ...(row.investigation ? [{ entityType: INVESTIGATION_ENTITY, entityId: row.investigation.id }] : [])],
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((e) => ({ id: e.id, entityType: e.entityType, action: e.action, actorName: e.actorName, changes: e.changes, metadata: e.metadata, createdAt: e.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    };
  },

  async overview(user: CurrentUser): Promise<IncidentOverviewDto> {
    const visible = incidentVisibleWhere(user);
    const today = todayFor(user.timeZone);
    const todayDate = toDate(today);
    const active: Prisma.IncidentWhereInput = { AND: [visible, { archivedAt: null }] };
    const overdueInvestigation: Prisma.IncidentWhereInput = {
      AND: [
        active,
        { isDraft: false, closedAt: null, investigationTargetDate: { lt: todayDate }, type: { investigationEnabled: true } },
        { OR: [{ investigation: { is: null } }, { investigation: { status: "IN_PROGRESS" } }] },
      ],
    };
    const actionsVisible: Prisma.CorrectiveActionWhereInput = { AND: [actionVisibleWhere(user), { archivedAt: null }] };

    const open = await prisma.incident.count({ where: { AND: [active, { status: { in: OPEN_INCIDENT_STATUSES } }] } });
    const overdueInvestigations = await prisma.incident.count({ where: overdueInvestigation });
    const openActions = await prisma.correctiveAction.count({ where: { AND: [actionsVisible, { state: { in: ["OPEN", "IN_PROGRESS"] } }] } });
    const pendingReviews = await prisma.correctiveAction.count({ where: { AND: [actionsVisible, { state: "AWAITING_EFFECTIVENESS" }] } });
    const myDraftsWhere: Prisma.IncidentWhereInput = { AND: [active, { isDraft: true, OR: reportedByWhere(user) }] };
    const drafts = await prisma.incident.count({ where: myDraftsWhere });

    const needsAttention: IncidentOverviewDto["needsAttention"] = [];
    const overdueRows = await prisma.incident.findMany({ where: overdueInvestigation, orderBy: { investigationTargetDate: "asc" }, take: 4, select: { id: true, reference: true, title: true, investigationTargetDate: true } });
    for (const r of overdueRows) {
      needsAttention.push({ kind: "investigation", id: r.id, href: incidentHref(r.id), reference: r.reference, title: r.title, detail: "Investigation overdue", due: dateOnly(r.investigationTargetDate) });
    }
    const overdueActions = await prisma.correctiveAction.findMany({
      where: { AND: [actionsVisible, { OR: [{ state: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: todayDate } }, { state: "AWAITING_EFFECTIVENESS", plannedReviewDate: { lte: todayDate } }] }] },
      orderBy: { dueDate: "asc" },
      take: 4,
      select: { id: true, reference: true, description: true, state: true, dueDate: true, plannedReviewDate: true },
    });
    for (const a of overdueActions) {
      const review = a.state === "AWAITING_EFFECTIVENESS";
      needsAttention.push({
        kind: review ? "review" : "action",
        id: a.id,
        href: actionHref(a.id),
        reference: a.reference,
        title: a.description,
        detail: review ? "Effectiveness review due" : `${ACTION_STATE_LABELS[a.state]} · overdue`,
        due: dateOnly(review ? a.plannedReviewDate : a.dueDate),
      });
    }
    if (user.permissions.includes(PERMISSIONS.INCIDENT_CLOSE)) {
      const ready = await prisma.incident.findMany({ where: { AND: [active, { status: "READY_TO_CLOSE" }] }, orderBy: { updatedAt: "asc" }, take: 3, select: { id: true, reference: true, title: true } });
      for (const r of ready) needsAttention.push({ kind: "close", id: r.id, href: incidentHref(r.id), reference: r.reference, title: r.title, detail: "Ready to close", due: null });
    }
    const myDrafts = await prisma.incident.findMany({ where: myDraftsWhere, orderBy: { updatedAt: "desc" }, take: 3, select: { id: true, reference: true, title: true } });
    for (const r of myDrafts) needsAttention.push({ kind: "draft", id: r.id, href: incidentHref(r.id), reference: r.reference, title: r.title || "Untitled draft", detail: "Your draft – not submitted", due: null });

    const recentRows = await prisma.incident.findMany({ where: { AND: [active, { isDraft: false }] }, include: listInclude, orderBy: [{ submittedAt: "desc" }], take: 5 });
    const names = await loadNames(prisma, { sites: recentRows.map((r) => r.siteId), departments: recentRows.map((r) => r.departmentId) });

    const since = new Date(todayDate.getTime() - 365 * 86_400_000);
    const submittedYear: Prisma.IncidentWhereInput = { AND: [active, { isDraft: false, occurredAt: { gte: since } }] };
    const byStatus = await prisma.incident.groupBy({ by: ["status"], where: { AND: [active, { status: { in: OPEN_INCIDENT_STATUSES } }] }, _count: { _all: true } });
    const byType = await prisma.incident.groupBy({ by: ["typeLabel"], where: submittedYear, _count: { _all: true } });
    const bySeverity = await prisma.incident.groupBy({ by: ["severity"], where: submittedYear, _count: { _all: true } });
    const sixMonths = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() - 5, 1));
    const monthRows = await prisma.incident.findMany({ where: { AND: [active, { isDraft: false, occurredAt: { gte: sixMonths } }] }, select: { occurredAt: true } });
    const months: { key: string; label: string; value: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(Date.UTC(sixMonths.getUTCFullYear(), sixMonths.getUTCMonth() + i, 1));
      months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }), value: 0 });
    }
    for (const r of monthRows) {
      const m = months.find((x) => x.key === r.occurredAt?.toISOString().slice(0, 7));
      if (m) m.value += 1;
    }

    return {
      today,
      counts: { open, overdueInvestigations, openActions, pendingReviews, drafts },
      needsAttention: needsAttention.slice(0, 10),
      recent: recentRows.map((r) => toListItem(r, names, today)),
      charts: {
        byStatus: byStatus.map((s) => ({ label: INCIDENT_STATUS_LABELS[s.status], value: s._count._all })).sort((a, b) => b.value - a.value),
        byType: byType.map((s) => ({ label: s.typeLabel, value: s._count._all })).sort((a, b) => b.value - a.value),
        bySeverity: (["MINOR", "MAJOR", "CRITICAL"] as const).map((sev) => ({ label: SEVERITY_LABELS[sev], value: bySeverity.find((b) => b.severity === sev)?._count._all ?? 0 })),
        byMonth: months.map(({ label, value }) => ({ label, value })),
      },
    };
  },

  /** Register CSV in the configured column order (exportable custom answers only; confidential details respected). */
  async exportCsv(user: CurrentUser, q: Omit<IncidentListQuery, "page" | "pageSize">): Promise<Response> {
    const settings = await settingsService.get("incident");
    const columns = settings.exportColumns;
    const where = incidentListWhere(user, q);
    const rows = await prisma.incident.findMany({
      where,
      orderBy: orderBy(q),
      take: 10_000,
      include: {
        ...listInclude,
        investigation: { select: { status: true, causeIds: true, operatingHoursLost: true, absences: { select: { startDate: true, endDate: true, restricted: true } } } },
      },
    });
    const names = await loadNames(prisma, {
      users: rows.flatMap((r) => [r.reporterId]),
      sites: rows.map((r) => r.siteId),
      locations: rows.map((r) => r.locationId),
      departments: rows.map((r) => r.departmentId),
    });
    const causes = await causeCatalogue(prisma);
    // Custom answer column labels: first report form that has the question.
    const answerLabels = new Map<string, string>();
    for (const r of rows) for (const f of asSnapshot(r.reportForm)?.fields ?? []) if (!answerLabels.has(f.key)) answerLabels.set(f.key, f.label);
    const header = columns.map((c) => (isStandardColumn(c) ? STANDARD_EXPORT_COLUMNS[c] : c.startsWith(ANSWER_COLUMN_PREFIX) ? (answerLabels.get(c.slice(ANSWER_COLUMN_PREFIX.length)) ?? c.slice(ANSWER_COLUMN_PREFIX.length)) : c));
    const out: CsvValue[][] = [header];
    for (const r of rows) {
      const seeConfidential = canSeeConfidential(user, recordFacts(r));
      const snapshot = asSnapshot(r.reportForm);
      const answers = asAnswers(r.answers);
      const absences = (r.investigation?.absences ?? []).map((a) => ({ startDate: dateOnly(a.startDate)!, endDate: dateOnly(a.endDate)!, restricted: a.restricted }));
      const value = (column: string): CsvValue => {
        if (column.startsWith(ANSWER_COLUMN_PREFIX)) {
          const key = column.slice(ANSWER_COLUMN_PREFIX.length);
          const field = snapshot?.fields.find((f) => f.key === key);
          if (!field || field.exportable === false || !seeConfidential) return "";
          if (field.type === "person") return names.users.get(String(answers[key])) ?? "";
          return formatAnswer(field, answers[key]);
        }
        switch (column) {
          case "reference":
            return r.reference;
          case "title":
            return r.title;
          case "type":
            return r.typeLabel;
          case "subtype":
            return r.subtypeLabel ?? "";
          case "severity":
            return SEVERITY_LABELS[r.severity];
          case "status":
            return INCIDENT_STATUS_LABELS[r.status];
          case "occurredAt":
            return r.occurredAt?.toISOString().slice(0, 16).replace("T", " ") ?? "";
          case "submittedAt":
            return r.submittedAt?.toISOString().slice(0, 10) ?? "";
          case "reporter":
            return r.isAnonymous ? "Anonymous" : (r.reporter?.name ?? "");
          case "site":
            return r.siteId ? (names.sites.get(r.siteId) ?? "") : "";
          case "location":
            return r.locationId ? (names.locations.get(r.locationId) ?? "") : "";
          case "department":
            return r.departmentId ? (names.departments.get(r.departmentId) ?? "") : "";
          case "preciseLocation":
            return r.preciseLocation ?? "";
          case "shift":
            return r.shift ?? "";
          case "investigators":
            return r.investigators.map((i) => i.user.name).join("; ");
          case "targetDate":
            return dateOnly(r.investigationTargetDate) ?? "";
          case "investigationStatus":
            return r.investigation ? INVESTIGATION_STATUS_LABELS[r.investigation.status] : "";
          case "causes":
            return (r.investigation?.causeIds ?? []).map((id) => causes.get(id)?.label ?? "").filter(Boolean).join("; ");
          case "daysLost":
            return r.investigation ? daysLost(absences) : "";
          case "hoursLost":
            return r.investigation?.operatingHoursLost ?? "";
          case "actions":
            return r.actions.filter((a) => !a.action.archivedAt).length;
          case "confidential":
            return r.isConfidential;
          case "closedAt":
            return r.closedAt?.toISOString().slice(0, 10) ?? "";
          default:
            return "";
        }
      };
      out.push(columns.map(value));
    }
    return csvResponse(csvName("incidents"), out);
  },
};

export type { NamedRef };
