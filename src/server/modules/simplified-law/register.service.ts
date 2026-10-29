import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { SLAW_LEGISLATION_ENTITY, SLAW_REQUIREMENT_ENTITY } from "@/lib/simplified-law";
import { isActionOverdue, lawProgress, needsRecheck, nextStep, overviewRoles, registerSteps, requirementCounts, type RequirementCounts } from "@/lib/simplified-law/rules";
import type { Paginated } from "@/lib/validation/common";
import type { LegislationListQuery } from "@/lib/validation/simplified-law";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import { canAssess, canManage, canViewRegister } from "./slaw-access.policy";
import type {
  SlawCategoryNode,
  SlawHistoryEntry,
  SlawLegislationDetailDto,
  SlawLegislationListItem,
  SlawRequirementDto,
  SlawSummaryDto,
} from "./slaw.dto";
import { dateOnly, named, toDate, todayFor, userNames } from "./support";

/** Register reads: Overview summary, category tree (step 1), legislation list (step 2), law detail (steps 3–5), history. */

function requireRegister(user: CurrentUser) {
  if (!canViewRegister(user)) throw new NotFoundError();
}

const listSelect = {
  id: true,
  title: true,
  shortTitle: true,
  reference: true,
  jurisdiction: true,
  status: true,
  kindLabel: true,
  relationNote: true,
  summary: true,
  officialUrl: true,
  applicability: true,
  archivedAt: true,
  sourceKey: true,
  category: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } },
} satisfies Prisma.SlawLegislationSelect;

type ListRow = Prisma.SlawLegislationGetPayload<{ select: typeof listSelect }>;

/** Requirement counts per law (archived requirements excluded). */
async function countsFor(ids: readonly string[]): Promise<Map<string, RequirementCounts>> {
  const out = new Map<string, RequirementCounts>();
  if (!ids.length) return out;
  const groups = await prisma.slawRequirement.groupBy({
    by: ["legislationId", "compliance", "actionStatus"],
    where: { legislationId: { in: [...ids] }, archivedAt: null },
    _count: { _all: true },
  });
  const rows = new Map<string, { compliance: (typeof groups)[number]["compliance"]; actionStatus: (typeof groups)[number]["actionStatus"] }[]>();
  for (const g of groups) {
    const list = rows.get(g.legislationId) ?? [];
    for (let i = 0; i < g._count._all; i++) list.push({ compliance: g.compliance, actionStatus: g.actionStatus });
    rows.set(g.legislationId, list);
  }
  for (const id of ids) out.set(id, requirementCounts(rows.get(id) ?? []));
  return out;
}

function toListItem(r: ListRow, counts: RequirementCounts): SlawLegislationListItem {
  return {
    id: r.id,
    title: r.title,
    shortTitle: r.shortTitle,
    reference: r.reference,
    jurisdiction: r.jurisdiction,
    status: r.status,
    kindLabel: r.kindLabel,
    relationNote: r.relationNote,
    summary: r.summary,
    officialUrl: r.officialUrl,
    category: { id: r.category.id, name: r.category.name },
    parentCategory: r.category.parent ? { id: r.category.parent.id, name: r.category.parent.name } : null,
    applicability: r.applicability,
    counts,
    progress: lawProgress({ status: r.status, applicability: r.applicability, counts }),
    archived: Boolean(r.archivedAt),
    custom: !r.sourceKey,
  };
}

/** Laws whose requirements include something not compliant. */
const notCompliantWhere: Prisma.SlawLegislationWhereInput = { applicability: "APPLIES", status: { not: "REPEALED" }, requirements: { some: { compliance: "NOT_COMPLIANT", archivedAt: null } } };

export function legislationWhere(q: Omit<LegislationListQuery, "page" | "pageSize">, categoryIds: string[] | null): Prisma.SlawLegislationWhereInput {
  const and: Prisma.SlawLegislationWhereInput[] = [{ archivedAt: q.archived === "true" ? { not: null } : null }];
  if (categoryIds) and.push({ categoryId: { in: categoryIds } });
  if (q.jurisdiction) and.push({ jurisdiction: q.jurisdiction });
  if (q.status) and.push({ status: q.status });
  else if (q.hideRepealed === "true") and.push({ status: { not: "REPEALED" } });
  if (q.check === "NOT_CHECKED") and.push({ applicability: "NOT_CHECKED", status: { not: "REPEALED" } });
  else if (q.check === "APPLIES") and.push({ applicability: "APPLIES" });
  else if (q.check === "DOES_NOT_APPLY") and.push({ applicability: "DOES_NOT_APPLY" });
  else if (q.check === "NOT_COMPLIANT") and.push(notCompliantWhere);
  if (q.q) {
    and.push({
      OR: [
        { title: { contains: q.q, mode: "insensitive" } },
        { shortTitle: { contains: q.q, mode: "insensitive" } },
        { reference: { contains: q.q, mode: "insensitive" } },
        { summary: { contains: q.q, mode: "insensitive" } },
      ],
    });
  }
  return { AND: and };
}

/** A category id → itself plus its sub-categories (a sub-category → itself). */
async function categoryScope(categoryId: string | undefined): Promise<string[] | null> {
  if (!categoryId) return null;
  const cat = await prisma.slawCategory.findFirst({ where: { id: categoryId }, select: { id: true, children: { select: { id: true } } } });
  if (!cat) throw new NotFoundError();
  return [cat.id, ...cat.children.map((c) => c.id)];
}

/** Live laws keep their order (stable sort); superseded, then repealed ones go last. */
const SINK = { ACTIVE: 0, AFFECTED: 0, SUPERSEDED: 1, REPEALED: 2 } as const;

export const slawRegisterService = {
  async summary(user: CurrentUser): Promise<SlawSummaryDto> {
    const today = toDate(todayFor(user.timeZone));
    const openMine = prisma.slawRequirement.count({ where: { actionStatus: "OPEN", actionOwnerId: user.id, archivedAt: null, legislation: { archivedAt: null } } });
    if (!canViewRegister(user)) {
      return { laws: 0, applies: 0, notChecked: 0, notCompliant: 0, openActions: 0, overdueActions: 0, myOpenActions: await openMine };
    }
    const live: Prisma.SlawLegislationWhereInput = { archivedAt: null, status: { not: "REPEALED" } };
    const openReq: Prisma.SlawRequirementWhereInput = { actionStatus: "OPEN", archivedAt: null, legislation: live };
    const [laws, applies, notChecked, notCompliant, openActions, overdueActions, myOpenActions] = await Promise.all([
      prisma.slawLegislation.count({ where: live }),
      prisma.slawLegislation.count({ where: { ...live, applicability: "APPLIES" } }),
      prisma.slawLegislation.count({ where: { ...live, applicability: "NOT_CHECKED" } }),
      prisma.slawRequirement.count({ where: { compliance: "NOT_COMPLIANT", archivedAt: null, legislation: { ...live, applicability: "APPLIES" } } }),
      prisma.slawRequirement.count({ where: openReq }),
      prisma.slawRequirement.count({ where: { ...openReq, actionDueDate: { lt: today } } }),
      openMine,
    ]);
    return { laws, applies, notChecked, notCompliant, openActions, overdueActions, myOpenActions };
  },

  /** Category → sub-category tree with law counts (archived categories only for Configuration). */
  async categories(user: CurrentUser, includeArchived = false): Promise<SlawCategoryNode[]> {
    requireRegister(user);
    const [cats, groups] = await Promise.all([
      prisma.slawCategory.findMany({ where: includeArchived ? {} : { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.slawLegislation.groupBy({ by: ["categoryId", "jurisdiction"], where: { archivedAt: null }, _count: { _all: true } }),
    ]);
    const byCat = new Map<string, Record<string, number>>();
    for (const g of groups) {
      const m = byCat.get(g.categoryId) ?? {};
      m[g.jurisdiction] = (m[g.jurisdiction] ?? 0) + g._count._all;
      byCat.set(g.categoryId, m);
    }
    const node = (c: (typeof cats)[number], children: SlawCategoryNode[]): SlawCategoryNode => {
      const jurisdictions: Record<string, number> = { ...(byCat.get(c.id) ?? {}) };
      for (const child of children) for (const [j, n] of Object.entries(child.jurisdictions)) jurisdictions[j] = (jurisdictions[j] ?? 0) + n;
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        archived: Boolean(c.archivedAt),
        legislationCount: Object.values(jurisdictions).reduce((a, b) => a + b, 0),
        jurisdictions,
        children,
      };
    };
    return cats
      .filter((c) => !c.parentId)
      .map((top) => node(top, cats.filter((c) => c.parentId === top.id).map((child) => node(child, []))));
  },

  async list(user: CurrentUser, q: LegislationListQuery): Promise<Paginated<SlawLegislationListItem>> {
    requireRegister(user);
    if (q.archived === "true" && !canManage(user)) throw new NotFoundError();
    const where = legislationWhere(q, await categoryScope(q.categoryId));
    const [rows, total] = await Promise.all([
      prisma.slawLegislation.findMany({ where, select: listSelect, orderBy: [{ category: { parent: { sortOrder: "asc" } } }, { category: { sortOrder: "asc" } }, { createdAt: "asc" }, { id: "asc" }], take: 500 }),
      prisma.slawLegislation.count({ where }),
    ]);
    // Category order, then the order laws were added; superseded and repealed ones (greyed) sink to the bottom.
    rows.sort((a, b) => SINK[a.status] - SINK[b.status]);
    const page = rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    const counts = await countsFor(page.map((r) => r.id));
    return { items: page.map((r) => toListItem(r, counts.get(r.id)!)), total, page: q.page, pageSize: q.pageSize };
  },

  async detail(user: CurrentUser, id: string): Promise<SlawLegislationDetailDto> {
    requireRegister(user);
    const row = await prisma.slawLegislation.findFirst({
      where: { id, archivedAt: canManage(user) ? undefined : null },
      select: {
        ...listSelect,
        guidanceUrl: true,
        applicabilityReason: true,
        applicabilityById: true,
        applicabilityAt: true,
        version: true,
        updatedAt: true,
        articles: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        questions: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        requirements: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!row) throw new NotFoundError();
    const today = todayFor(user.timeZone);
    const names = await userNames(prisma, [
      row.applicabilityById,
      ...row.questions.map((q) => q.answeredById),
      ...row.requirements.flatMap((r) => [r.assessedById, r.actionOwnerId, r.actionSetById, r.actionCompletedById]),
    ]);
    const counts = requirementCounts(row.requirements);
    const requirements: SlawRequirementDto[] = row.requirements.map((r) => ({
      id: r.id,
      section: r.section,
      text: r.text,
      articles: r.articles,
      compliance: r.compliance,
      reason: r.reason,
      assessedBy: named(names, r.assessedById),
      assessedAt: r.assessedAt?.toISOString() ?? null,
      action: {
        text: r.actionText,
        owner: named(names, r.actionOwnerId),
        dueDate: dateOnly(r.actionDueDate),
        status: r.actionStatus,
        overdue: isActionOverdue(r.actionStatus, dateOnly(r.actionDueDate), today),
        setBy: named(names, r.actionSetById),
        completedAt: r.actionCompletedAt?.toISOString() ?? null,
        completedBy: named(names, r.actionCompletedById),
        note: r.actionNote,
      },
      recheck: needsRecheck(r.compliance, r.actionStatus),
      version: r.version,
    }));
    const law = { status: row.status, applicability: row.applicability, counts };
    return {
      ...toListItem(row, counts),
      guidanceUrl: row.guidanceUrl,
      applicabilityReason: row.applicabilityReason,
      applicabilityBy: named(names, row.applicabilityById),
      applicabilityAt: row.applicabilityAt?.toISOString() ?? null,
      version: row.version,
      articles: row.articles.map((a) => ({ id: a.id, chapter: a.chapter, number: a.number, title: a.title, appliesFrom: dateOnly(a.appliesFrom), appliesTo: a.appliesTo })),
      roles: overviewRoles(row.articles),
      questions: row.questions.map((q) => ({
        id: q.id,
        text: q.text,
        answer: q.answer,
        reason: q.reason,
        answeredBy: named(names, q.answeredById),
        answeredAt: q.answeredAt?.toISOString() ?? null,
      })),
      requirements,
      nextStep: nextStep({ ...law, canAssess: canAssess(user) && !row.archivedAt }),
      steps: registerSteps("law", law),
      rights: { assess: canAssess(user) && !row.archivedAt, manage: canManage(user) },
      updatedAt: row.updatedAt.toISOString(),
    };
  },

  /** The law's own entries plus those of its requirements, newest first. */
  async history(user: CurrentUser, id: string, page: number, pageSize: number): Promise<Paginated<SlawHistoryEntry>> {
    requireRegister(user);
    const law = await prisma.slawLegislation.findFirst({ where: { id }, select: { id: true, requirements: { select: { id: true, text: true } } } });
    if (!law) throw new NotFoundError();
    const reqText = new Map(law.requirements.map((r) => [r.id, r.text]));
    const where: Prisma.AuditLogWhereInput = {
      OR: [
        { entityType: SLAW_LEGISLATION_ENTITY, entityId: id },
        ...(reqText.size ? [{ entityType: SLAW_REQUIREMENT_ENTITY, entityId: { in: [...reqText.keys()] } }] : []),
      ],
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((e) => ({
        id: e.id,
        action: e.action,
        actorName: e.actorName,
        changes: e.changes,
        metadata: e.metadata,
        createdAt: e.createdAt.toISOString(),
        subject: e.entityType === SLAW_REQUIREMENT_ENTITY ? (reqText.get(e.entityId) ?? null) : null,
      })),
      total,
      page,
      pageSize,
    };
  },
};
