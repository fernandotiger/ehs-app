import "server-only";
import { SLAW_CATEGORY_ENTITY } from "@/lib/simplified-law";
import { moveInOrder, nameBlockers, parseRoles } from "@/lib/simplified-law/rules";
import type {
  ArticleInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  LegislationInput,
  LegislationUpdateInput,
  QuestionInput,
  RequirementInput,
} from "@/lib/validation/simplified-law";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { requireTenantId } from "@/server/tenancy/context";
import { closeOpenActions } from "./assessment.service";
import { slawSettingsService } from "./settings.service";
import { blocked, SLAW_AUDIT, SLAW_LEGISLATION_ENTITY, toDate } from "./support";

/**
 * Simplified law → Configuration: categories, the company's own laws, and the content of every law
 * (overview articles, screening questions, requirements). Kept inside the module on purpose – the
 * platform Configuration hub is not touched. Every change is audited; answered questions and
 * assessed requirements are archived, never deleted.
 */

type Direction = "up" | "down";

async function reorder(ids: string[], id: string, direction: Direction, update: (id: string, sortOrder: number) => Promise<unknown>) {
  const next = moveInOrder(ids, id, direction);
  for (let i = 0; i < next.length; i++) if (next[i] !== ids[i]) await update(next[i]!, i);
}

async function contentAudit(tx: DbClient, user: CurrentUser, legislationId: string, what: string, detail: Record<string, unknown>, meta: RequestMeta) {
  await recordAudit({ entityType: SLAW_LEGISLATION_ENTITY, entityId: legislationId, action: SLAW_AUDIT.CONTENT_CHANGED, actor: user, metadata: { what, ...detail }, meta }, tx);
}

async function loadLaw(db: DbClient, id: string) {
  const law = await db.slawLegislation.findFirst({ where: { id }, select: { id: true, archivedAt: true } });
  if (!law) throw new NotFoundError();
  return law;
}

/** The sub-category a law goes under and its jurisdiction must exist (foreign ids are simply not found). */
async function checkPlacement(db: DbClient, input: Pick<LegislationInput, "categoryId" | "jurisdiction">) {
  const cat = await db.slawCategory.findFirst({ where: { id: input.categoryId, archivedAt: null }, select: { parentId: true } });
  if (!cat) throw new ValidationError("Choose a sub-category from the list.");
  if (!cat.parentId) throw new ValidationError("Choose a sub-category, not a top-level category.");
  const settings = await slawSettingsService.get(db);
  if (!settings.jurisdictions.includes(input.jurisdiction)) throw new ValidationError("Choose a jurisdiction from the list (add new ones under Jurisdictions).");
}

function lawData(input: LegislationInput) {
  return {
    categoryId: input.categoryId,
    title: input.title,
    shortTitle: input.shortTitle,
    reference: input.reference,
    jurisdiction: input.jurisdiction,
    status: input.status,
    kindLabel: input.kindLabel,
    relationNote: input.relationNote,
    summary: input.summary,
    officialUrl: input.officialUrl,
    guidanceUrl: input.guidanceUrl,
  };
}

export const slawConfigService = {
  // ── Categories ────────────────────────────────────────────────────────────

  async createCategory(input: CategoryCreateInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      if (input.parentId) {
        const parent = await tx.slawCategory.findFirst({ where: { id: input.parentId, archivedAt: null }, select: { parentId: true } });
        if (!parent) throw new ValidationError("Choose a category from the list.");
        if (parent.parentId) throw new ValidationError("Sub-categories cannot have their own sub-categories.");
      }
      const siblings = await tx.slawCategory.findMany({ where: { parentId: input.parentId ?? null, archivedAt: null }, select: { name: true, sortOrder: true } });
      const gates = nameBlockers(input.name, siblings.map((s) => s.name), input.parentId ? "sub-category" : "category");
      if (gates.length) blocked("It cannot be added", gates);
      const row = await tx.slawCategory.create({
        data: {
          organizationId: requireTenantId(),
          parentId: input.parentId ?? null,
          name: input.name,
          description: input.description,
          sortOrder: siblings.reduce((m, s) => Math.max(m, s.sortOrder + 1), 0),
        },
        select: { id: true },
      });
      await recordAudit({ entityType: SLAW_CATEGORY_ENTITY, entityId: row.id, action: SLAW_AUDIT.CATEGORY_CREATED, actor: user, changes: { name: input.name, parentId: input.parentId }, meta }, tx);
      return row;
    });
  },

  async updateCategory(id: string, input: CategoryUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const cat = await tx.slawCategory.findFirst({ where: { id } });
      if (!cat) throw new NotFoundError();
      const siblings = await tx.slawCategory.findMany({ where: { parentId: cat.parentId, archivedAt: null, id: { not: id } }, select: { name: true } });
      const gates = nameBlockers(input.name, siblings.map((s) => s.name), cat.parentId ? "sub-category" : "category");
      if (gates.length) blocked("It cannot be renamed", gates);
      await tx.slawCategory.update({ where: { id }, data: { name: input.name, description: input.description } });
      await recordAudit({ entityType: SLAW_CATEGORY_ENTITY, entityId: id, action: SLAW_AUDIT.CATEGORY_UPDATED, actor: user, changes: diff(cat, input), meta }, tx);
    });
  },

  async moveCategory(id: string, direction: Direction): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const cat = await tx.slawCategory.findFirst({ where: { id }, select: { parentId: true } });
      if (!cat) throw new NotFoundError();
      const siblings = await tx.slawCategory.findMany({ where: { parentId: cat.parentId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true } });
      await reorder(siblings.map((s) => s.id), id, direction, (sid, sortOrder) => tx.slawCategory.update({ where: { id: sid }, data: { sortOrder } }));
    });
  },

  /** Archive only empty categories (no live sub-categories / laws); restore needs a live parent. */
  async archiveCategory(id: string, archived: boolean, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const cat = await tx.slawCategory.findFirst({ where: { id }, include: { parent: { select: { archivedAt: true } } } });
      if (!cat) throw new NotFoundError();
      if (archived) {
        const [subs, laws] = await Promise.all([
          tx.slawCategory.count({ where: { parentId: id, archivedAt: null } }),
          tx.slawLegislation.count({ where: { categoryId: id, archivedAt: null } }),
        ]);
        const gates: string[] = [];
        if (subs) gates.push(`Archive or move its ${subs} sub-categor${subs === 1 ? "y" : "ies"} first.`);
        if (laws) gates.push(`Move or archive its ${laws} law${laws === 1 ? "" : "s"} first.`);
        if (gates.length) blocked("It cannot be archived", gates);
      } else if (cat.parent?.archivedAt) {
        blocked("It cannot be restored", ["Restore its category first."]);
      }
      await tx.slawCategory.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await recordAudit({ entityType: SLAW_CATEGORY_ENTITY, entityId: id, action: archived ? SLAW_AUDIT.CATEGORY_ARCHIVED : SLAW_AUDIT.CATEGORY_RESTORED, actor: user, meta }, tx);
    });
  },

  // ── Legislation ───────────────────────────────────────────────────────────

  async createLegislation(input: LegislationInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      await checkPlacement(tx, input);
      const row = await tx.slawLegislation.create({ data: { organizationId: requireTenantId(), ...lawData(input), createdById: user.id }, select: { id: true } });
      await recordAudit({ entityType: SLAW_LEGISLATION_ENTITY, entityId: row.id, action: SLAW_AUDIT.LEGISLATION_CREATED, actor: user, changes: { title: input.title, reference: input.reference, jurisdiction: input.jurisdiction, status: input.status }, meta }, tx);
      return row;
    });
  },

  /** Details of a law; marking it repealed closes its open actions (repealed laws are not checked). */
  async updateLegislation(id: string, input: LegislationUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<{ closedActions: number }> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.slawLegislation.findFirst({ where: { id } });
      if (!before) throw new NotFoundError();
      await checkPlacement(tx, input);
      const data = lawData(input);
      const res = await tx.slawLegislation.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (res.count === 0) throw new StaleVersionError();
      const closedActions = before.status !== "REPEALED" && input.status === "REPEALED" ? await closeOpenActions(tx, id, "Closed automatically – the law was marked as repealed.", user, meta) : 0;
      await recordAudit({ entityType: SLAW_LEGISLATION_ENTITY, entityId: id, action: SLAW_AUDIT.LEGISLATION_UPDATED, actor: user, changes: diff(before, data), metadata: closedActions ? { closedActions } : null, meta }, tx);
      return { closedActions };
    });
  },

  /** Archived laws leave the register (their open actions are closed); restoring brings the law and its answers back. */
  async archiveLegislation(id: string, archived: boolean, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const law = await tx.slawLegislation.findFirst({ where: { id }, include: { category: { select: { archivedAt: true } } } });
      if (!law) throw new NotFoundError();
      if (!archived && law.category.archivedAt) blocked("The law cannot be restored", ["Restore its sub-category first, or move the law to another one."]);
      const closedActions = archived ? await closeOpenActions(tx, id, "Closed automatically – the law was archived.", user, meta) : 0;
      await tx.slawLegislation.update({ where: { id }, data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } } });
      await recordAudit({ entityType: SLAW_LEGISLATION_ENTITY, entityId: id, action: archived ? SLAW_AUDIT.LEGISLATION_ARCHIVED : SLAW_AUDIT.LEGISLATION_RESTORED, actor: user, metadata: closedActions ? { closedActions } : null, meta }, tx);
    });
  },

  // ── Overview articles ─────────────────────────────────────────────────────

  async addArticle(legislationId: string, input: ArticleInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      await loadLaw(tx, legislationId);
      const last = await tx.slawArticle.aggregate({ where: { legislationId }, _max: { sortOrder: true } });
      const row = await tx.slawArticle.create({
        data: {
          organizationId: requireTenantId(),
          legislationId,
          chapter: input.chapter,
          number: input.number,
          title: input.title,
          appliesFrom: input.appliesFrom ? toDate(input.appliesFrom) : null,
          appliesTo: parseRoles(input.appliesTo),
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        select: { id: true },
      });
      await contentAudit(tx, user, legislationId, "Overview article added", { article: `${input.number} ${input.title}` }, meta);
      return row;
    });
  },

  async updateArticle(id: string, input: ArticleInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.slawArticle.findFirst({ where: { id }, select: { legislationId: true } });
      if (!row) throw new NotFoundError();
      await tx.slawArticle.update({
        where: { id },
        data: { chapter: input.chapter, number: input.number, title: input.title, appliesFrom: input.appliesFrom ? toDate(input.appliesFrom) : null, appliesTo: parseRoles(input.appliesTo) },
      });
      await contentAudit(tx, user, row.legislationId, "Overview article changed", { article: `${input.number} ${input.title}` }, meta);
    });
  },

  /** Overview rows are reference text only (no answers hang on them), so they are removed outright – audited. */
  async removeArticle(id: string, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.slawArticle.findFirst({ where: { id }, select: { legislationId: true, number: true, title: true } });
      if (!row) throw new NotFoundError();
      await tx.slawArticle.delete({ where: { id } });
      await contentAudit(tx, user, row.legislationId, "Overview article removed", { article: `${row.number} ${row.title}` }, meta);
    });
  },

  async moveArticle(id: string, direction: Direction): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.slawArticle.findFirst({ where: { id }, select: { legislationId: true } });
      if (!row) throw new NotFoundError();
      const all = await tx.slawArticle.findMany({ where: { legislationId: row.legislationId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
      await reorder(all.map((a) => a.id), id, direction, (aid, sortOrder) => tx.slawArticle.update({ where: { id: aid }, data: { sortOrder } }));
    });
  },

  // ── Screening questions ───────────────────────────────────────────────────

  async addQuestion(legislationId: string, input: QuestionInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      await loadLaw(tx, legislationId);
      const last = await tx.slawQuestion.aggregate({ where: { legislationId, archivedAt: null }, _max: { sortOrder: true } });
      const row = await tx.slawQuestion.create({ data: { organizationId: requireTenantId(), legislationId, text: input.text, sortOrder: (last._max.sortOrder ?? -1) + 1 }, select: { id: true } });
      await contentAudit(tx, user, legislationId, "Question added", { text: input.text }, meta);
      return row;
    });
  },

  async updateQuestion(id: string, input: QuestionInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.slawQuestion.findFirst({ where: { id, archivedAt: null }, select: { legislationId: true, text: true } });
      if (!row) throw new NotFoundError();
      await tx.slawQuestion.update({ where: { id }, data: { text: input.text } });
      await contentAudit(tx, user, row.legislationId, "Question changed", { from: row.text, text: input.text }, meta);
    });
  },

  async removeQuestion(id: string, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.slawQuestion.findFirst({ where: { id, archivedAt: null }, select: { legislationId: true, text: true } });
      if (!row) throw new NotFoundError();
      await tx.slawQuestion.update({ where: { id }, data: { archivedAt: new Date() } });
      await contentAudit(tx, user, row.legislationId, "Question removed", { text: row.text }, meta);
    });
  },

  async moveQuestion(id: string, direction: Direction): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.slawQuestion.findFirst({ where: { id, archivedAt: null }, select: { legislationId: true } });
      if (!row) throw new NotFoundError();
      const all = await tx.slawQuestion.findMany({ where: { legislationId: row.legislationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
      await reorder(all.map((q) => q.id), id, direction, (qid, sortOrder) => tx.slawQuestion.update({ where: { id: qid }, data: { sortOrder } }));
    });
  },

  // ── Requirements ──────────────────────────────────────────────────────────

  async addRequirement(legislationId: string, input: RequirementInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
      await loadLaw(tx, legislationId);
      const last = await tx.slawRequirement.aggregate({ where: { legislationId, archivedAt: null }, _max: { sortOrder: true } });
      const row = await tx.slawRequirement.create({
        data: { organizationId: requireTenantId(), legislationId, section: input.section, text: input.text, articles: input.articles, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        select: { id: true },
      });
      await contentAudit(tx, user, legislationId, "Requirement added", { text: input.text }, meta);
      return row;
    });
  },

  async updateRequirement(id: string, input: RequirementInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.slawRequirement.findFirst({ where: { id, archivedAt: null }, select: { legislationId: true, text: true } });
      if (!row) throw new NotFoundError();
      await tx.slawRequirement.update({ where: { id }, data: { section: input.section, text: input.text, articles: input.articles, version: { increment: 1 } } });
      await contentAudit(tx, user, row.legislationId, "Requirement changed", { from: row.text, text: input.text }, meta);
    });
  },

  /** Removing a requirement archives it (its answer and action stay in the history); an open action is closed. */
  async removeRequirement(id: string, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.slawRequirement.findFirst({ where: { id, archivedAt: null }, select: { legislationId: true, text: true, actionStatus: true } });
      if (!row) throw new NotFoundError();
      const closing = row.actionStatus === "OPEN";
      await tx.slawRequirement.update({
        where: { id },
        data: {
          archivedAt: new Date(),
          ...(closing ? { actionStatus: "DONE", actionCompletedAt: new Date(), actionCompletedById: user.id, actionNote: "Closed automatically – the requirement was removed." } : {}),
          version: { increment: 1 },
        },
      });
      await contentAudit(tx, user, row.legislationId, "Requirement removed", { text: row.text, closedAction: closing }, meta);
    });
  },

  async moveRequirement(id: string, direction: Direction): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const row = await tx.slawRequirement.findFirst({ where: { id, archivedAt: null }, select: { legislationId: true } });
      if (!row) throw new NotFoundError();
      const all = await tx.slawRequirement.findMany({ where: { legislationId: row.legislationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
      await reorder(all.map((r) => r.id), id, direction, (rid, sortOrder) => tx.slawRequirement.update({ where: { id: rid }, data: { sortOrder } }));
    });
  },
};
