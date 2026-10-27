import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { normaliseLabel, type LookupListKey, type LookupValueDto, type LookupValueInput, type LookupValueUpdateInput } from "@/lib/lookups";

export type { LookupValueDto };
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ConflictError, NotFoundError, ValidationError } from "@/server/http/errors";
import { requireTenantId } from "@/server/tenancy/context";

const select = {
  id: true,
  listKey: true,
  label: true,
  code: true,
  notes: true,
  color: true,
  sortOrder: true,
  isActive: true,
  isSystem: true,
} satisfies Prisma.LookupValueSelect;

const ENTITY = "LookupValue";

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function assertUniqueLabel(db: DbClient, listKey: string, label: string, excludeId?: string) {
  const existing = await db.lookupValue.findMany({
    where: { listKey, label: { equals: label.trim(), mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, label: true },
  });
  if (existing.some((row) => normaliseLabel(row.label) === normaliseLabel(label))) {
    throw new ConflictError(`"${label.trim()}" already exists in this list.`);
  }
}

/**
 * Configurable pick-lists (src/lib/lookups.ts declares the lists; values are tenant data).
 * Values are never deleted: deactivate them so historical records keep their label.
 */
export const lookupService = {
  async values(listKey: LookupListKey, opts: { includeInactive?: boolean } = {}): Promise<LookupValueDto[]> {
    return prisma.lookupValue.findMany({
      where: { listKey, ...(opts.includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select,
    });
  },

  async create(listKey: LookupListKey, input: LookupValueInput, actor: CurrentUser, meta: RequestMeta): Promise<LookupValueDto> {
    const organizationId = requireTenantId();
    try {
      return await prisma.$transaction(async (tx) => {
        await assertUniqueLabel(tx, listKey, input.label);
        const last = await tx.lookupValue.aggregate({ where: { listKey }, _max: { sortOrder: true } });
        const row = await tx.lookupValue.create({
          data: {
            organizationId,
            listKey,
            label: input.label.trim().replace(/\s+/g, " "),
            code: clean(input.code),
            notes: clean(input.notes),
            color: clean(input.color),
            sortOrder: (last._max.sortOrder ?? -1) + 1,
          },
          select,
        });
        await recordAudit({ entityType: ENTITY, entityId: row.id, action: "CREATED", actor, changes: { listKey, ...input }, meta }, tx);
        return row;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError(`"${input.label.trim()}" already exists in this list.`);
      }
      throw error;
    }
  },

  async update(listKey: LookupListKey, id: string, input: LookupValueUpdateInput, actor: CurrentUser, meta: RequestMeta): Promise<LookupValueDto> {
    const before = await prisma.lookupValue.findFirst({ where: { id, listKey }, select });
    if (!before) throw new NotFoundError();
    return prisma.$transaction(async (tx) => {
      if (input.label !== undefined) await assertUniqueLabel(tx, listKey, input.label, id);
      const data = {
        ...(input.label !== undefined ? { label: input.label.trim().replace(/\s+/g, " ") } : {}),
        ...(input.code !== undefined ? { code: clean(input.code) } : {}),
        ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
        ...(input.color !== undefined ? { color: clean(input.color) } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      };
      const row = await tx.lookupValue.update({ where: { id }, data, select });
      const changes = diff(before as unknown as Record<string, unknown>, data);
      if (changes) await recordAudit({ entityType: ENTITY, entityId: id, action: "UPDATED", actor, changes, meta }, tx);
      return row;
    });
  },

  async deactivate(listKey: LookupListKey, id: string, actor: CurrentUser, meta: RequestMeta): Promise<LookupValueDto> {
    return this.update(listKey, id, { isActive: false }, actor, meta);
  },

  /** `ids` is the complete new order of the list (values not mentioned keep their relative order at the end). */
  async reorder(listKey: LookupListKey, ids: string[], actor: CurrentUser, meta: RequestMeta): Promise<LookupValueDto[]> {
    const rows = await prisma.lookupValue.findMany({ where: { listKey }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { id: true } });
    const known = new Set(rows.map((r) => r.id));
    if (ids.some((id) => !known.has(id))) throw new ValidationError("The list contains an unknown value.");
    const order = [...new Set(ids), ...rows.map((r) => r.id).filter((id) => !ids.includes(id))];
    await prisma.$transaction(async (tx) => {
      for (const [index, id] of order.entries()) await tx.lookupValue.update({ where: { id }, data: { sortOrder: index } });
      await recordAudit({ entityType: ENTITY, entityId: listKey, action: "REORDERED", actor, changes: { order }, meta }, tx);
    });
    return this.values(listKey, { includeInactive: true });
  },
};
