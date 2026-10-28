import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ALL_REGISTERS, asChanges, isLawTaskOverdue, jurisdictionsOf, type LawContent } from "@/lib/law";
import type { Paginated } from "@/lib/validation/common";
import type { LawLegislationQuery, LawRequirementListQuery, LawTaskListQuery } from "@/lib/validation/law";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import { describeEntity } from "@/server/modules/entities/registry";
import { localDate } from "@/server/modules/jobs/engine";
import { requireTenantId } from "@/server/tenancy/context";
import { nonComplianceReadiness } from "./incident-type";
import type {
  LawAttentionItem,
  LawHistoryEntry,
  LawLegislationDetailDto,
  LawLegislationListItem,
  LawLegislationPage,
  LawOverviewDto,
  LawProfileDetailDto,
  LawProfileListItem,
  LawRequirementDetailDto,
  LawRequirementListItem,
  LawRequirementPage,
  LawTaskDetailDto,
  LawTaskListItem,
  LawTaskSummaryDto,
} from "./law.dto";
import { canConfirmReview, canEditProfile, canEvaluate, canManageLawAt, profileVisibleWhere, requirementVisibleWhere, taskRights, taskVisibleWhere } from "./law-access.policy";
import { loadVisibleProfile } from "./profile.service";
import { evaluationFacts, rowInScope } from "./requirement-sync";
import { loadVisibleRequirement, requirementFacts } from "./requirement.service";
import { asAnswers, asSnapshot, dateOnly, findVersion, isNewer, latestVersion, loadNames, loadVersions, placementOf, PROFILE_ENTITY, REQUIREMENT_ENTITY, requirementHref, TASK_ENTITY, taskHref, toDate, todayFor, type ContentVersionRow, type NameMaps } from "./support";
import { loadVisibleTask, taskFacts, taskSelect, type TaskRow } from "./task.service";
import { complianceSummary, evaluationStatus, isReviewOverdue, lifecycle, missingForComplete, nextStep } from "./workflow";

/** Law registers, details, overview, library and tasks (read side). Visibility: law-access.policy.ts. */

const DAY = 86_400_000;

const rowSelect = {
  id: true,
  reference: true,
  kind: true,
  contentKey: true,
  title: true,
  register: true,
  category: true,
  keywords: true,
  requirementText: true,
  isRelevant: true,
  relevanceNotes: true,
  evaluationNotes: true,
  rating: true,
  ownerId: true,
  departmentId: true,
  nextReviewDate: true,
  evaluatedOn: true,
  reviewRequired: true,
  archivedAt: true,
  profileId: true,
  updatedAt: true,
  _count: { select: { tasks: { where: { status: "OPEN", archivedAt: null } } } },
} satisfies Prisma.LawRequirementSelect;

type Row = Prisma.LawRequirementGetPayload<{ select: typeof rowSelect }>;

interface ProfileLite {
  id: string;
  name: string;
  ownerId: string;
  siteId: string | null;
  jurisdiction: string;
  activities: string[];
  contentVersion: string;
  showRating: boolean;
  isShared: boolean;
  archivedAt: Date | null;
}

const profileLiteSelect = { id: true, name: true, ownerId: true, siteId: true, jurisdiction: true, activities: true, contentVersion: true, showRating: true, isShared: true, archivedAt: true } as const;

interface Evaluated {
  row: Row;
  inScope: boolean;
  status: ReturnType<typeof evaluationStatus>;
  reviewOverdue: boolean;
}

const REGISTER_ORDER = new Map<string, number>(ALL_REGISTERS.map((r, i) => [r, i]));

function contentOf(versions: readonly ContentVersionRow[], version: string): LawContent {
  return findVersion(versions, version)?.content ?? { legislation: [], checklists: [] };
}

function evaluate(rows: readonly Row[], profile: ProfileLite, content: LawContent, today: string): Evaluated[] {
  return rows.map((row) => {
    const facts = evaluationFacts(row);
    return { row, inScope: rowInScope(row, profile, content), status: evaluationStatus(facts), reviewOverdue: isReviewOverdue(facts, today) };
  });
}

function summaryOf(items: readonly Evaluated[], today: string) {
  return complianceSummary(
    items.map((i) => ({ ...evaluationFacts(i.row), inScope: i.inScope, rating: i.row.rating })),
    today,
  );
}

function toListItem(e: Evaluated, profile: ProfileLite, names: NameMaps): LawRequirementListItem {
  const r = e.row;
  return {
    id: r.id,
    reference: r.reference,
    kind: r.kind,
    contentKey: r.contentKey,
    title: r.title,
    register: r.register,
    category: r.category,
    status: e.status,
    inScope: e.inScope,
    reviewOverdue: e.reviewOverdue,
    owner: r.ownerId ? { id: r.ownerId, name: names.users.get(r.ownerId) ?? "Unknown" } : null,
    departmentName: r.departmentId ? (names.departments.get(r.departmentId) ?? null) : null,
    nextReviewDate: dateOnly(r.nextReviewDate),
    evaluatedOn: dateOnly(r.evaluatedOn),
    rating: r.rating,
    openTasks: r._count.tasks,
    profile: { id: profile.id, name: profile.name, showRating: profile.showRating },
  };
}

function matches(text: string, haystack: (string | null | undefined)[], exact: boolean): boolean {
  const hay = haystack.filter(Boolean).join("\n").toLowerCase();
  const needle = text.toLowerCase().trim();
  if (!needle) return true;
  if (exact) return hay.includes(needle);
  return needle.split(/\s+/).every((w) => hay.includes(w));
}

async function visibleProfiles(user: CurrentUser, includeArchived = false): Promise<ProfileLite[]> {
  return prisma.lawProfile.findMany({ where: { AND: [profileVisibleWhere(user), includeArchived ? {} : { archivedAt: null }] }, select: profileLiteSelect, orderBy: { name: "asc" } });
}

async function rowsFor(user: CurrentUser, profileIds: string[]): Promise<Row[]> {
  if (!profileIds.length) return [];
  return prisma.lawRequirement.findMany({ where: { AND: [{ profileId: { in: profileIds } }, requirementVisibleWhere(user)] }, select: rowSelect });
}

async function overdueTasksByProfile(user: CurrentUser, profileIds: string[], today: string): Promise<Map<string, number>> {
  if (!profileIds.length) return new Map();
  const groups = await prisma.lawTask.groupBy({
    by: ["profileId"],
    where: { AND: [taskVisibleWhere(user), { profileId: { in: profileIds }, status: "OPEN", archivedAt: null, dueDate: { lt: toDate(today) } }] },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.profileId, g._count._all]));
}

async function history(entityType: string, entityId: string, page: number, pageSize: number): Promise<Paginated<LawHistoryEntry>> {
  const where: Prisma.AuditLogWhereInput = { entityType, entityId };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count({ where }),
  ]);
  return { items: items.map((e) => ({ id: e.id, action: e.action, actorName: e.actorName, changes: e.changes, metadata: e.metadata, createdAt: e.createdAt.toISOString() })), total, page, pageSize };
}

function profileListItem(p: ProfileLite, evaluated: Evaluated[], names: NameMaps, latest: ContentVersionRow | null, overdue: number, today: string): LawProfileListItem {
  return {
    id: p.id,
    name: p.name,
    site: p.siteId ? { id: p.siteId, name: names.sites.get(p.siteId) ?? "Unknown" } : null,
    owner: { id: p.ownerId, name: names.users.get(p.ownerId) ?? "Unknown" },
    jurisdiction: p.jurisdiction,
    activities: p.activities,
    isShared: p.isShared,
    showRating: p.showRating,
    contentVersion: p.contentVersion,
    updateAvailable: latest && isNewer(latest.version, p.contentVersion) ? latest.version : null,
    archived: Boolean(p.archivedAt),
    summary: summaryOf(evaluated, today),
    overdueTasks: overdue,
  };
}

function taskListItem(t: TaskRow, names: NameMaps, user: CurrentUser, today: string): LawTaskListItem {
  const dueDate = dateOnly(t.dueDate)!;
  return {
    id: t.id,
    reference: t.reference,
    title: t.title,
    status: t.status,
    priority: t.priority,
    owner: { id: t.ownerId, name: names.users.get(t.ownerId) ?? "Unknown" },
    dueDate,
    overdue: !t.archivedAt && isLawTaskOverdue(t.status, dueDate, today),
    archived: Boolean(t.archivedAt),
    completedOn: dateOnly(t.completedOn),
    departmentName: t.departmentId ? (names.departments.get(t.departmentId) ?? null) : null,
    requirement: { id: t.requirement.id, reference: t.requirement.reference, title: t.requirement.title, register: t.requirement.register, category: t.requirement.category },
    profile: { id: t.requirement.profile.id, name: t.requirement.profile.name },
    assignedToMe: t.ownerId === user.id,
  };
}

export const lawQueryService = {
  // ── Profiles ──────────────────────────────────────────────────────────────

  async profiles(user: CurrentUser, includeArchived: boolean): Promise<LawProfileListItem[]> {
    const today = todayFor(user.timeZone);
    const [profiles, versions] = await Promise.all([visibleProfiles(user, includeArchived), loadVersions(prisma)]);
    const ids = profiles.map((p) => p.id);
    const [rows, overdue] = await Promise.all([rowsFor(user, ids), overdueTasksByProfile(user, ids, today)]);
    const names = await loadNames(prisma, { users: profiles.map((p) => p.ownerId), sites: profiles.map((p) => p.siteId) });
    const latest = latestVersion(versions);
    return profiles.map((p) => profileListItem(p, evaluate(rows.filter((r) => r.profileId === p.id), p, contentOf(versions, p.contentVersion), today), names, latest, overdue.get(p.id) ?? 0, today));
  },

  async profile(user: CurrentUser, id: string): Promise<LawProfileDetailDto> {
    const row = await loadVisibleProfile(prisma, user, id);
    const full = await prisma.lawProfile.findUniqueOrThrow({ where: { id }, select: { ...profileLiteSelect, description: true, createdAt: true } });
    const today = todayFor(user.timeZone);
    const versions = await loadVersions(prisma);
    const [rows, overdue] = await Promise.all([rowsFor(user, [id]), overdueTasksByProfile(user, [id], today)]);
    const names = await loadNames(prisma, { users: [row.ownerId], sites: [row.siteId] });
    const item = profileListItem(full, evaluate(rows, full, contentOf(versions, full.contentVersion), today), names, latestVersion(versions), overdue.get(id) ?? 0, today);
    const edit = canEditProfile(user, row);
    return {
      ...item,
      description: full.description,
      version: row.version,
      businessUnitId: row.businessUnitId,
      siteId: row.siteId,
      createdAt: full.createdAt.toISOString(),
      permissions: { edit, manage: canManageLawAt(user, placementOf(row)), addRequirement: edit && !row.archivedAt },
      jurisdictions: jurisdictionsOf(contentOf(versions, full.contentVersion)),
    };
  },

  async profileHistory(user: CurrentUser, id: string, page: number, pageSize: number): Promise<Paginated<LawHistoryEntry>> {
    await loadVisibleProfile(prisma, user, id);
    return history(PROFILE_ENTITY, id, page, pageSize);
  },

  // ── Requirements ──────────────────────────────────────────────────────────

  async requirements(user: CurrentUser, q: LawRequirementListQuery): Promise<LawRequirementPage> {
    const today = todayFor(user.timeZone);
    const profiles = await visibleProfiles(user);
    const profile = (q.profileId ? profiles.find((p) => p.id === q.profileId) : profiles[0]) ?? null;
    if (!profile) return { items: [], total: 0, page: q.page, pageSize: q.pageSize, profile: null, categories: [] };
    const versions = await loadVersions(prisma);
    const content = contentOf(versions, profile.contentVersion);
    const evaluated = evaluate(await rowsFor(user, [profile.id]), profile, content, today);
    const requirementText = (e: Evaluated) => (e.row.kind === "OTHER" ? e.row.requirementText : (content.checklists.find((c) => c.id === e.row.contentKey)?.requirements ?? ""));
    const filtered = evaluated
      .filter((e) => {
        if (q.view === "applies" && !(e.inScope && e.row.isRelevant)) return false;
        if (q.view === "not-relevant" && !(e.inScope && !e.row.isRelevant)) return false;
        if (q.view === "outside" && e.inScope) return false;
        if (q.status && e.status !== q.status) return false;
        if (q.register && e.row.register !== q.register) return false;
        if (q.category && e.row.category !== q.category) return false;
        if (q.mine === "true" && e.row.ownerId !== user.id) return false;
        if (q.attention === "true" && !(e.inScope && (e.status === "REVIEW_REQUIRED" || e.reviewOverdue))) return false;
        return !q.q || matches(q.q, [e.row.reference, e.row.contentKey, e.row.title, e.row.category, e.row.keywords.join(" "), requirementText(e)], false);
      })
      .sort((a, b) => (REGISTER_ORDER.get(a.row.register) ?? 9) - (REGISTER_ORDER.get(b.row.register) ?? 9) || a.row.title.localeCompare(b.row.title));
    const pageRows = filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    const names = await loadNames(prisma, { users: pageRows.map((e) => e.row.ownerId), departments: pageRows.map((e) => e.row.departmentId) });
    return {
      items: pageRows.map((e) => toListItem(e, profile, names)),
      total: filtered.length,
      page: q.page,
      pageSize: q.pageSize,
      profile: { id: profile.id, name: profile.name, contentVersion: profile.contentVersion, showRating: profile.showRating },
      categories: [...new Set(evaluated.map((e) => e.row.category))].sort((a, b) => a.localeCompare(b)),
    };
  },

  async requirement(user: CurrentUser, id: string): Promise<LawRequirementDetailDto> {
    const row = await loadVisibleRequirement(prisma, user, id);
    const today = todayFor(user.timeZone);
    const versions = await loadVersions(prisma);
    const content = contentOf(versions, row.profile.contentVersion);
    const checklist = row.kind === "CONTENT" ? content.checklists.find((c) => c.id === row.contentKey) : undefined;
    const lite = await prisma.lawRequirement.findUniqueOrThrow({ where: { id }, select: rowSelect });
    const [evaluated] = evaluate([lite], { ...row.profile, isShared: true, name: row.profile.name }, content, today);
    const names = await loadNames(prisma, { users: [row.ownerId], departments: [row.departmentId], sites: [row.profile.siteId] });
    const facts = evaluationFacts(row);
    const rights = requirementFacts(row);
    const evaluate_ = canEvaluate(user, rights) && !row.profile.archivedAt && !row.archivedAt;
    const editRequirement = row.kind === "OTHER" && canEditProfile(user, { ...placementOf(row), ownerId: row.profile.ownerId }) && !row.profile.archivedAt;
    return {
      ...toListItem(evaluated!, { ...row.profile, isShared: true }, names),
      version: row.version,
      requirementText: row.kind === "OTHER" ? row.requirementText : (checklist?.requirements ?? ""),
      keywords: row.keywords,
      legislation: (checklist?.legislationIds ?? [])
        .map((lid) => content.legislation.find((l) => l.id === lid))
        .filter((l): l is NonNullable<typeof l> => Boolean(l))
        .map((l) => ({ id: l.id, title: l.title, reference: l.reference, level: l.level, sourceUrl: l.sourceUrl, active: l.active })),
      isRelevant: row.isRelevant,
      exclusionReason: row.exclusionReason,
      relevanceNotes: row.relevanceNotes,
      evaluationNotes: row.evaluationNotes,
      ownerId: row.ownerId,
      departmentId: row.departmentId,
      siteId: row.siteId,
      reviewRequired: row.reviewRequired,
      reviewReason: row.reviewReason,
      archived: Boolean(row.archivedAt),
      profileArchived: Boolean(row.profile.archivedAt),
      profileSiteName: row.profile.siteId ? (names.sites.get(row.profile.siteId) ?? null) : null,
      contentVersion: row.profile.contentVersion,
      form: asSnapshot(row.form),
      answers: asAnswers(row.answers),
      today,
      missing: row.isRelevant ? missingForComplete(facts) : [],
      lifecycle: lifecycle(facts),
      nextStep: nextStep(evaluated!.status, { canEvaluate: evaluate_, reviewOverdue: evaluated!.reviewOverdue, inScope: evaluated!.inScope }),
      permissions: { evaluate: evaluate_, confirmReview: canConfirmReview(user, rights), editRequirement, evidence: evaluate_, openProfile: Boolean(await prisma.lawProfile.count({ where: { AND: [{ id: row.profile.id }, profileVisibleWhere(user)] } })) },
      incidentReadiness: user.enabledModules.includes("incidents")
        ? await nonComplianceReadiness(prisma, requireTenantId())
        : { ready: false, problem: "The Incidents module is not enabled for your company.", typeName: null, formName: null, fixable: false },
      modules: { risk: user.enabledModules.includes("risk"), incidents: user.enabledModules.includes("incidents") },
    };
  },

  async requirementHistory(user: CurrentUser, id: string, page: number, pageSize: number): Promise<Paginated<LawHistoryEntry>> {
    await loadVisibleRequirement(prisma, user, id);
    return history(REQUIREMENT_ENTITY, id, page, pageSize);
  },

  // ── Overview ──────────────────────────────────────────────────────────────

  async overview(user: CurrentUser, profileId: string | null): Promise<LawOverviewDto> {
    const today = todayFor(user.timeZone);
    const [profiles, versions] = await Promise.all([visibleProfiles(user), loadVersions(prisma)]);
    const canCreateProfile = (user.grants["law.requirement.manage"] ?? []).length > 0;
    const names0 = await loadNames(prisma, { sites: profiles.map((p) => p.siteId), users: profiles.map((p) => p.ownerId) });
    const base = { profiles: profiles.map((p) => ({ id: p.id, name: p.name, siteName: p.siteId ? (names0.sites.get(p.siteId) ?? null) : null })), canCreateProfile, libraryInstalled: versions.length > 0 };
    const profile = (profileId ? profiles.find((p) => p.id === profileId) : profiles[0]) ?? null;
    if (!profile) return { ...base, profile: null, upcomingReviews: 0, attention: [], recent: [] };
    const content = contentOf(versions, profile.contentVersion);
    const evaluated = evaluate(await rowsFor(user, [profile.id]), profile, content, today);
    const overdueTasks = await prisma.lawTask.findMany({
      where: { AND: [taskVisibleWhere(user), { profileId: profile.id, status: "OPEN", archivedAt: null, dueDate: { lt: toDate(today) } }] },
      select: { id: true, reference: true, title: true, dueDate: true, ownerId: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    });
    const overdueCount = (await overdueTasksByProfile(user, [profile.id], today)).get(profile.id) ?? 0;
    const latest = latestVersion(versions);
    const item = profileListItem(profile, evaluated, names0, latest, overdueCount, today);
    const in30 = localDate(new Date(toDate(today).getTime() + 30 * DAY), "UTC");
    const scoped = evaluated.filter((e) => e.inScope && e.row.isRelevant);
    const attention: LawAttentionItem[] = [];
    if (item.updateAvailable) attention.push({ kind: "update-available", label: `Legal content ${item.updateAvailable} is available`, detail: "Review what changed and accept it into this profile.", href: `/law/profiles/${profile.id}` });
    for (const e of scoped.filter((x) => x.status === "REVIEW_REQUIRED").slice(0, 4)) attention.push({ kind: "review-required", label: e.row.title, detail: "The law changed – review your controls and evidence", href: requirementHref(e.row.id) });
    for (const e of scoped.filter((x) => x.reviewOverdue && x.status !== "REVIEW_REQUIRED").slice(0, 3)) attention.push({ kind: "review-overdue", label: e.row.title, detail: `Review was due ${dateOnly(e.row.nextReviewDate)}`, href: requirementHref(e.row.id) });
    const ownerNames = await loadNames(prisma, { users: overdueTasks.map((t) => t.ownerId) });
    for (const t of overdueTasks.slice(0, 3)) attention.push({ kind: "task-overdue", label: `${t.reference} · ${t.title}`, detail: `Task overdue since ${dateOnly(t.dueDate)} · ${ownerNames.users.get(t.ownerId) ?? ""}`, href: taskHref(t.id) });
    const notStarted = scoped.filter((x) => x.status === "NOT_STARTED").length;
    if (notStarted) attention.push({ kind: "not-started", label: `${notStarted} requirement${notStarted === 1 ? "" : "s"} not checked yet`, detail: "Open them and record why they apply and how you comply.", href: `/law/requirements?profile=${profile.id}&status=NOT_STARTED` });
    return {
      ...base,
      profile: item,
      upcomingReviews: scoped.filter((e) => e.row.nextReviewDate && dateOnly(e.row.nextReviewDate)! >= today && dateOnly(e.row.nextReviewDate)! <= in30).length,
      attention,
      recent: evaluated
        .filter((e) => e.row.evaluatedOn)
        .sort((a, b) => b.row.updatedAt.getTime() - a.row.updatedAt.getTime())
        .slice(0, 5)
        .map((e) => ({ id: e.row.id, reference: e.row.reference, title: e.row.title, status: e.status, evaluatedOn: dateOnly(e.row.evaluatedOn), href: requirementHref(e.row.id) })),
    };
  },

  // ── Library (legislation) ─────────────────────────────────────────────────

  async legislation(user: CurrentUser, q: LawLegislationQuery): Promise<LawLegislationPage> {
    const versions = await loadVersions(prisma);
    const profiles = await visibleProfiles(user);
    const profile = q.profileId ? (profiles.find((p) => p.id === q.profileId) ?? null) : null;
    const version = profile ? findVersion(versions, profile.contentVersion) : latestVersion(versions);
    if (!version) return { items: [], total: 0, page: q.page, pageSize: q.pageSize, contentVersion: null, profile: null };
    const content = version.content;
    const rowKeys = profile ? new Set((await rowsFor(user, [profile.id])).map((r) => r.contentKey)) : new Set<string | null>();
    const items = content.legislation
      .filter((l) => (!q.register || l.domain === q.register) && (!q.category || l.category === q.category) && (!q.level || l.level === q.level))
      .filter((l) => !q.q || matches(q.q, [l.reference, l.title, l.synopsis, l.keywords.join(" ")], q.exact === "true"))
      .sort((a, b) => a.reference.localeCompare(b.reference));
    const toItem = (l: (typeof items)[number]): LawLegislationListItem => ({
      id: l.id,
      title: l.title,
      reference: l.reference,
      level: l.level,
      sourceUrl: l.sourceUrl,
      active: l.active,
      jurisdiction: l.jurisdiction,
      domain: l.domain,
      category: l.category,
      synopsis: l.synopsis,
      keywords: l.keywords,
      parentId: l.parentId,
      requirementCount: content.checklists.filter((c) => c.legislationIds.includes(l.id) && rowKeys.has(c.id)).length,
    });
    return {
      items: items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map(toItem),
      total: items.length,
      page: q.page,
      pageSize: q.pageSize,
      contentVersion: version.version,
      profile: profile ? { id: profile.id, name: profile.name } : null,
    };
  },

  async legislationItem(user: CurrentUser, legislationId: string, profileId: string | null): Promise<LawLegislationDetailDto> {
    const versions = await loadVersions(prisma);
    const profiles = await visibleProfiles(user);
    const profile = profileId ? (profiles.find((p) => p.id === profileId) ?? null) : null;
    const version = profile ? findVersion(versions, profile.contentVersion) : latestVersion(versions);
    const l = version?.content.legislation.find((x) => x.id === legislationId);
    if (!version || !l) throw new NotFoundError();
    const content = version.content;
    const ref = (x: typeof l) => ({ id: x.id, title: x.title, reference: x.reference, level: x.level, sourceUrl: x.sourceUrl, active: x.active });
    const rows = profile ? await rowsFor(user, [profile.id]) : [];
    const checklists = content.checklists.filter((c) => c.legislationIds.includes(l.id));
    const rowByKey = new Map(rows.map((r) => [r.contentKey, r]));
    const linkedRows = checklists.map((c) => rowByKey.get(c.id)).filter((r): r is Row => Boolean(r));
    const links = linkedRows.length ? await prisma.lawLink.findMany({ where: { requirementId: { in: linkedRows.map((r) => r.id) }, targetType: "RiskAssessment" } }) : [];
    const riskAssessments: LawLegislationDetailDto["riskAssessments"] = [];
    for (const link of links) {
      const summary = await describeEntity(user, link.targetType, link.targetId);
      if (summary) riskAssessments.push({ label: summary.label, href: summary.href, context: link.context });
    }
    const scope = profile ? { jurisdiction: profile.jurisdiction, activities: profile.activities } : null;
    return {
      ...ref(l),
      jurisdiction: l.jurisdiction,
      domain: l.domain,
      category: l.category,
      synopsis: l.synopsis,
      keywords: l.keywords,
      parentId: l.parentId,
      requirementCount: linkedRows.length,
      contentVersion: version.version,
      parent: (() => {
        const p = content.legislation.find((x) => x.id === l.parentId);
        return p ? ref(p) : null;
      })(),
      children: content.legislation.filter((x) => x.parentId === l.id).map(ref),
      checklists: checklists.map((c) => {
        const row = rowByKey.get(c.id);
        return { id: c.id, title: c.title, requirementId: row?.id ?? null, requirementReference: row?.reference ?? null, applies: scope ? rowInScope({ kind: "CONTENT", contentKey: c.id, archivedAt: null }, scope, content) : c.active };
      }),
      riskAssessments,
      history: versions
        .filter((v) => v.rank <= version.rank)
        .flatMap((v) => asChanges(v.changes).filter((c) => c.kind === "legislation" && c.id === l.id).map((c) => ({ version: v.version, change: c.change, releasedOn: dateOnly(v.releasedOn)! }))),
      profile: profile ? { id: profile.id, name: profile.name } : null,
    };
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async tasks(user: CurrentUser, q: LawTaskListQuery): Promise<Paginated<LawTaskListItem>> {
    const today = todayFor(user.timeZone);
    const todayDate = toDate(today);
    const and: Prisma.LawTaskWhereInput[] = [taskVisibleWhere(user)];
    if (q.view === "mine") and.push({ ownerId: user.id });
    if (q.status === "OPEN") and.push({ status: "OPEN", archivedAt: null });
    else if (q.status === "COMPLETED") and.push({ status: "COMPLETED", archivedAt: null });
    else if (q.status === "ARCHIVED") and.push({ archivedAt: { not: null } });
    if (q.profileId) and.push({ profileId: q.profileId });
    if (q.requirementId) and.push({ requirementId: q.requirementId });
    if (q.register) and.push({ requirement: { register: q.register } });
    if (q.due === "overdue") and.push({ status: "OPEN", archivedAt: null, dueDate: { lt: todayDate } });
    if (q.due === "week") and.push({ status: "OPEN", archivedAt: null, dueDate: { gte: todayDate, lte: new Date(todayDate.getTime() + 6 * DAY) } });
    if (q.q) and.push({ OR: [{ reference: { contains: q.q, mode: "insensitive" } }, { title: { contains: q.q, mode: "insensitive" } }, { details: { contains: q.q, mode: "insensitive" } }] });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      prisma.lawTask.findMany({ where, select: taskSelect, orderBy: [{ status: "asc" }, { dueDate: "asc" }, { reference: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      prisma.lawTask.count({ where }),
    ]);
    const names = await loadNames(prisma, { users: rows.map((r) => r.ownerId), departments: rows.map((r) => r.departmentId) });
    return { items: rows.map((r) => taskListItem(r, names, user, today)), total, page: q.page, pageSize: q.pageSize };
  },

  async task(user: CurrentUser, id: string): Promise<LawTaskDetailDto> {
    const row = await loadVisibleTask(prisma, user, id);
    const today = todayFor(user.timeZone);
    const names = await loadNames(prisma, { users: [row.ownerId, row.createdById, row.completedById], departments: [row.departmentId] });
    return {
      ...taskListItem(row, names, user, today),
      details: row.details,
      version: row.version,
      departmentId: row.departmentId,
      siteId: row.siteId,
      createdBy: { id: row.createdById, name: names.users.get(row.createdById) ?? "Unknown" },
      createdOn: localDate(row.createdAt, user.timeZone),
      completedByName: row.completedById ? (names.users.get(row.completedById) ?? null) : null,
      completionNotes: row.completionNotes,
      today,
      permissions: taskRights(user, taskFacts(row)),
    };
  },

  async taskHistory(user: CurrentUser, id: string, page: number, pageSize: number): Promise<Paginated<LawHistoryEntry>> {
    await loadVisibleTask(prisma, user, id);
    return history(TASK_ENTITY, id, page, pageSize);
  },

  /** My open tasks / overdue / due this week and evaluations I own that are due for review (Home + Tasks banner). */
  async summary(user: CurrentUser): Promise<LawTaskSummaryDto> {
    const today = toDate(todayFor(user.timeZone));
    const weekEnd = new Date(today.getTime() + 6 * DAY);
    const open = { status: "OPEN" as const, archivedAt: null, ownerId: user.id };
    const [mine, overdue, dueSoon, reviewsDue] = await Promise.all([
      prisma.lawTask.count({ where: open }),
      prisma.lawTask.count({ where: { ...open, dueDate: { lt: today } } }),
      prisma.lawTask.count({ where: { ...open, dueDate: { gte: today, lte: weekEnd } } }),
      prisma.lawRequirement.count({ where: { ownerId: user.id, isRelevant: true, archivedAt: null, profile: { archivedAt: null }, OR: [{ reviewRequired: true }, { nextReviewDate: { lte: new Date(today.getTime() + 30 * DAY) } }] } }),
    ]);
    return { mine, overdue, dueSoon, reviewsDue };
  },
};
