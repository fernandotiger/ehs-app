import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { normaliseLabel, type LookupValueDto, type LookupValueInput, type LookupValueUpdateInput } from "@/lib/lookups";
import { PERMISSIONS } from "@/lib/permissions";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ConflictError, NotFoundError, ValidationError } from "@/server/http/errors";
import { cleanName, requireCompanyConfig } from "./config-access";

/**
 * Document categories shown as a list in Configuration → Lists (same shape as lookup values,
 * listKey "documents.category"). Categories are renamed or deactivated, never deleted, because
 * documents keep pointing at them.
 */
export const DOCUMENT_CATEGORY_LIST = "documents.category";

export interface CategoryListValueDto extends LookupValueDto {
  documentCount: number;
}

const select = {
  id: true,
  name: true,
  notes: true,
  color: true,
  sortOrder: true,
  isActive: true,
  _count: { select: { documents: true } },
} satisfies Prisma.DocumentCategorySelect;

type Row = Prisma.DocumentCategoryGetPayload<{ select: typeof select }>;

function toDto(r: Row): CategoryListValueDto {
  return {
    id: r.id,
    listKey: DOCUMENT_CATEGORY_LIST,
    label: r.name,
    code: null,
    notes: r.notes,
    color: r.color,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    isSystem: false,
    documentCount: r._count.documents,
  };
}

async function assertUnique(db: DbClient, name: string, excludeId?: string) {
  const rows = await db.documentCategory.findMany({
    where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { name: true },
  });
  if (rows.some((r) => normaliseLabel(r.name) === normaliseLabel(name))) throw new ConflictError(`"${name}" already exists in this list.`);
}

const clean = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export const categoryListService = {
  async values(actor: CurrentUser): Promise<CategoryListValueDto[]> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_LISTS);
    const rows = await prisma.documentCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select });
    return rows.map(toDto);
  },

  async create(input: LookupValueInput, actor: CurrentUser, meta: RequestMeta): Promise<CategoryListValueDto> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_LISTS);
    const name = cleanName(input.label);
    try {
      return await prisma.$transaction(async (tx) => {
        await assertUnique(tx, name);
        const last = await tx.documentCategory.aggregate({ _max: { sortOrder: true } });
        const row = await tx.documentCategory.create({
          data: { organizationId: actor.organizationId, name, notes: clean(input.notes), color: clean(input.color), sortOrder: (last._max.sortOrder ?? -1) + 1 },
          select,
        });
        await recordAudit({ entityType: "DocumentCategory", entityId: row.id, action: "CREATED", actor, changes: { name, notes: input.notes ?? null, color: input.color ?? null }, meta }, tx);
        return toDto(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(`"${name}" already exists in this list.`);
      throw error;
    }
  },

  async update(id: string, input: LookupValueUpdateInput, actor: CurrentUser, meta: RequestMeta): Promise<CategoryListValueDto> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_LISTS);
    return prisma.$transaction(async (tx) => {
      const before = await tx.documentCategory.findUnique({ where: { id } });
      if (!before) throw new NotFoundError();
      const name = input.label !== undefined ? cleanName(input.label) : undefined;
      if (name !== undefined && name !== before.name) await assertUnique(tx, name, id);
      const data = {
        ...(name !== undefined ? { name } : {}),
        ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
        ...(input.color !== undefined ? { color: clean(input.color) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      };
      const row = await tx.documentCategory.update({ where: { id }, data, select });
      const changes = diff(before as unknown as Record<string, unknown>, data);
      if (changes) await recordAudit({ entityType: "DocumentCategory", entityId: id, action: "UPDATED", actor, changes, meta }, tx);
      return toDto(row);
    });
  },

  async reorder(ids: string[], actor: CurrentUser, meta: RequestMeta): Promise<CategoryListValueDto[]> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_LISTS);
    const rows = await prisma.documentCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true } });
    const known = new Set(rows.map((r) => r.id));
    if (ids.some((id) => !known.has(id))) throw new ValidationError("The list contains an unknown value.");
    const order = [...new Set(ids), ...rows.map((r) => r.id).filter((id) => !ids.includes(id))];
    await prisma.$transaction(async (tx) => {
      for (const [index, id] of order.entries()) await tx.documentCategory.update({ where: { id }, data: { sortOrder: index } });
      await recordAudit({ entityType: "DocumentCategory", entityId: DOCUMENT_CATEGORY_LIST, action: "REORDERED", actor, changes: { order }, meta }, tx);
    });
    return this.values(actor);
  },
};
