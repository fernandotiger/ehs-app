import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { tagKey, uniqueTagNames, type TagListQuery } from "@/lib/validation/documents";
import { requireAnyPermission } from "@/server/auth/authorization";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import { assignedDocumentsWhere } from "./document-access.policy";
import { DOCUMENT_PERMISSIONS } from "./document-permissions";
import type { NamedRef, TagDto } from "./document.dto";
import { surveyDocumentsWhere } from "./survey-summary";

/**
 * Document tags: tenant-wide labels (unique per tenant, case-insensitively) that managers attach to
 * documents to group, filter and search them. Tags are created on first use and kept when no
 * document uses them any more.
 */

/** Include on a document query; map with `toTags`. */
export const documentTagsInclude = {
  select: { tag: { select: { id: true, name: true } } },
} satisfies Prisma.Document$tagsArgs;

/** Alphabetical, ignoring case (the database would put "fire" after "Induction"). */
export function byTagName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function toTags(links: { tag: NamedRef }[]): NamedRef[] {
  return links.map((l) => l.tag).sort(byTagName);
}

/** Documents carrying any tag whose name contains `q` (search). */
export function tagSearchWhere(q: string): Prisma.DocumentWhereInput {
  return { tags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } };
}

export function tagFilterWhere(tagId: string | undefined): Prisma.DocumentWhereInput {
  return tagId ? { tags: { some: { tagId } } } : {};
}

/**
 * Tag ids for these names, creating the missing ones. An existing tag is reused whatever its case
 * (it keeps its first spelling). `skipDuplicates` makes two people adding the same new tag at once safe.
 */
async function resolveTags(db: DbClient, names: readonly string[], organizationId: string): Promise<NamedRef[]> {
  const clean = uniqueTagNames(names);
  if (!clean.length) return [];
  await db.documentTag.createMany({
    data: clean.map((name) => ({ organizationId, name, normalizedName: tagKey(name) })),
    skipDuplicates: true,
  });
  const rows = await db.documentTag.findMany({ where: { normalizedName: { in: clean.map(tagKey) } }, select: { id: true, name: true, normalizedName: true } });
  const byKey = new Map(rows.map((r) => [r.normalizedName, { id: r.id, name: r.name }]));
  return clean.map((name) => byKey.get(tagKey(name))!).filter(Boolean);
}

/**
 * Replaces a document's tags inside the caller's transaction. Returns the tag names before and after
 * (sorted, as stored) for the audit record.
 */
export async function setDocumentTags(
  tx: DbClient,
  documentId: string,
  names: readonly string[],
  organizationId: string,
): Promise<{ before: string[]; after: string[] }> {
  const current = await tx.documentTagLink.findMany({ where: { documentId }, select: { tagId: true, tag: { select: { name: true } } } });
  const wanted = await resolveTags(tx, names, organizationId);
  const wantedIds = new Set(wanted.map((t) => t.id));
  const currentIds = new Set(current.map((l) => l.tagId));
  const removed = current.filter((l) => !wantedIds.has(l.tagId)).map((l) => l.tagId);
  const added = wanted.filter((t) => !currentIds.has(t.id));
  if (removed.length) await tx.documentTagLink.deleteMany({ where: { documentId, tagId: { in: removed } } });
  if (added.length) {
    await tx.documentTagLink.createMany({ data: added.map((t) => ({ organizationId, documentId, tagId: t.id })), skipDuplicates: true });
  }
  const sort = (names: string[]) => names.map((name) => ({ name })).sort(byTagName).map((t) => t.name);
  return { before: sort(current.map((l) => l.tag.name)), after: sort(wanted.map((t) => t.name)) };
}

export const documentTagService = {
  /**
   * Tags with the number of documents (surveys left out) using them.
   * - `library` (Document Library users): every tag, unused ones included – offered when tagging.
   * - `mine`: only tags on documents assigned to the user, so draft or restricted documents don't
   *   reveal their tags.
   */
  async list(user: CurrentUser, query: TagListQuery): Promise<TagDto[]> {
    let documentWhere: Prisma.DocumentWhereInput;
    if (query.scope === "library") {
      requireAnyPermission(user, DOCUMENT_PERMISSIONS.LIBRARY);
      documentWhere = surveyDocumentsWhere(false);
    } else {
      documentWhere = { AND: [assignedDocumentsWhere(user), surveyDocumentsWhere(false)] };
    }
    const rows = await prisma.documentTag.findMany({
      where: query.scope === "library" ? {} : { documents: { some: { document: documentWhere } } },
      select: { id: true, name: true, _count: { select: { documents: { where: { document: documentWhere } } } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, documentCount: r._count.documents })).sort(byTagName);
  },
};
