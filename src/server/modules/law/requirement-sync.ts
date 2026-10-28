import type { PrismaClient } from "@/generated/prisma/client";
import { applicableChecklists, checklistApplies, type LawContent, type ProfileScope } from "@/lib/law";
import type { EvaluationFacts } from "./workflow";

/**
 * Keeps a profile's requirement rows in step with its accepted content (pure DB helpers, no
 * server-only – the demo seed uses them too).
 *
 *  - A checklist that applies and has no row gets one (Not checked). Rows are never deleted: a row
 *    whose checklist no longer applies is simply "outside this profile" and keeps all its work.
 *  - Title / register / category of existing rows follow the accepted content.
 *  - Accepting an update flags rows with saved work whose checklist (or its legislation) changed.
 */

type Db = Pick<PrismaClient, "lawRequirement">;

export interface SyncProfile extends ProfileScope {
  id: string;
  businessUnitId: string | null;
  siteId: string | null;
}

export interface RowScopeFacts {
  kind: "CONTENT" | "OTHER";
  contentKey: string | null;
  archivedAt: Date | null;
}

/** Applies under the profile's current scope: a matching content checklist, or an active company requirement. */
export function rowInScope(row: RowScopeFacts, profile: ProfileScope, content: LawContent): boolean {
  if (row.kind === "OTHER") return !row.archivedAt;
  const checklist = content.checklists.find((c) => c.id === row.contentKey);
  return Boolean(checklist && checklistApplies(checklist, profile, content));
}

export function evaluationFacts(row: {
  isRelevant: boolean;
  relevanceNotes: string;
  evaluationNotes: string;
  ownerId: string | null;
  departmentId: string | null;
  nextReviewDate: Date | null;
  reviewRequired: boolean;
}): EvaluationFacts {
  return {
    isRelevant: row.isRelevant,
    relevanceNotes: row.relevanceNotes,
    evaluationNotes: row.evaluationNotes,
    ownerId: row.ownerId,
    departmentId: row.departmentId,
    nextReviewDate: row.nextReviewDate ? row.nextReviewDate.toISOString().slice(0, 10) : null,
    reviewRequired: row.reviewRequired,
  };
}

export async function syncProfileRequirements(
  db: Db,
  input: { organizationId: string; profile: SyncProfile; content: LawContent; nextReference: () => Promise<string>; actorId: string | null },
): Promise<{ created: { id: string; reference: string; title: string }[] }> {
  const { profile, content } = input;
  const rows = await db.lawRequirement.findMany({ where: { profileId: profile.id, kind: "CONTENT" }, select: { id: true, contentKey: true, title: true, register: true, category: true, keywords: true } });
  const byKey = new Map(rows.map((r) => [r.contentKey, r]));
  for (const c of content.checklists) {
    const row = byKey.get(c.id);
    if (row && (row.title !== c.title || row.register !== c.domain || row.category !== c.category || row.keywords.join("|") !== c.keywords.join("|"))) {
      await db.lawRequirement.update({ where: { id: row.id }, data: { title: c.title, register: c.domain, category: c.category, keywords: c.keywords } });
    }
  }
  const created: { id: string; reference: string; title: string }[] = [];
  for (const c of applicableChecklists(content, profile)) {
    if (byKey.has(c.id)) continue;
    const reference = await input.nextReference();
    const row = await db.lawRequirement.create({
      data: {
        organizationId: input.organizationId,
        profileId: profile.id,
        reference,
        kind: "CONTENT",
        contentKey: c.id,
        title: c.title,
        register: c.domain,
        category: c.category,
        keywords: c.keywords,
        businessUnitId: profile.businessUnitId,
        siteId: profile.siteId,
        createdById: input.actorId,
      },
      select: { id: true },
    });
    created.push({ id: row.id, reference, title: c.title });
  }
  return { created };
}

/** Rows with saved work (narratives, rating or an evaluated date) – the ones a content change must flag. */
export const SAVED_WORK = {
  OR: [{ relevanceNotes: { not: "" } }, { evaluationNotes: { not: "" } }, { rating: { not: null } }, { evaluatedOn: { not: null } }, { isRelevant: false }],
};

export async function flagChangedRequirements(db: Db, input: { profileId: string; changedKeys: ReadonlySet<string>; version: string }): Promise<{ id: string; reference: string; title: string }[]> {
  if (!input.changedKeys.size) return [];
  const rows = await db.lawRequirement.findMany({
    where: { profileId: input.profileId, kind: "CONTENT", contentKey: { in: [...input.changedKeys] }, ...SAVED_WORK },
    select: { id: true, reference: true, title: true },
  });
  for (const r of rows) {
    await db.lawRequirement.update({
      where: { id: r.id },
      data: { reviewRequired: true, reviewReason: `The requirement changed in ${input.version}. Review your controls and evidence, then confirm.`, version: { increment: 1 } },
    });
  }
  return rows;
}

