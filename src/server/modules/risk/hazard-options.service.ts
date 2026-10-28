import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { normaliseLabel } from "@/lib/lookups";
import { riskHazardListKey, type HazardOptionCreateInput, type HazardOptionFacts, type HazardOptionUpdateInput } from "@/lib/risk/hazard-options";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ConflictError, NotFoundError } from "@/server/http/errors";
import { requireTenantId } from "@/server/tenancy/context";
import { requireRiskConfig } from "./matrix.service";
import type { HazardOptionDto } from "./risk.dto";

/**
 * Hazard / aspect options per Risk form, shown in the Hazard dropdown of an assessment. Stored as
 * `LookupValue` rows under `risk.hazard:<formId>` (same model, uniqueness and audit entity as the
 * other pick-lists). Unlike the matrix rules they are not versioned with the form: changes show in
 * the dropdown at once, and assessments keep the names they already have.
 */

const ENTITY = "LookupValue";
const select = { id: true, label: true, isActive: true } satisfies Prisma.LookupValueSelect;

function cleanLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

async function loadRiskForm(db: DbClient, formId: string) {
  const form = await db.formDefinition.findFirst({ where: { id: formId, module: "risk" }, select: { id: true, name: true } });
  if (!form) throw new NotFoundError();
  return form;
}

async function assertUniqueLabel(db: DbClient, listKey: string, label: string, excludeId?: string) {
  const rows = await db.lookupValue.findMany({
    where: { listKey, label: { equals: label, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { label: true },
  });
  if (rows.some((r) => normaliseLabel(r.label) === normaliseLabel(label))) throw new ConflictError(`“${label}” is already in this list.`);
}

/** Options of a form (all of them, alphabetical) – for checking assessment hazard names. */
export async function hazardOptionsOf(db: DbClient, formId: string): Promise<HazardOptionFacts[]> {
  return db.lookupValue.findMany({ where: { listKey: riskHazardListKey(formId) }, orderBy: { label: "asc" }, select: { label: true, isActive: true } });
}

/** The Risk form a captured version belongs to. */
export async function formIdOfVersion(db: DbClient, versionId: string): Promise<string | null> {
  return (await db.formVersion.findUnique({ where: { id: versionId }, select: { formId: true } }))?.formId ?? null;
}

export const riskHazardOptionService = {
  /** Wizard: the active option names for the assessment's form version (empty = type the name). */
  async forFormVersion(versionId: string): Promise<{ options: string[] }> {
    const formId = await formIdOfVersion(prisma, versionId);
    if (!formId) throw new NotFoundError();
    const rows = await hazardOptionsOf(prisma, formId);
    return { options: rows.filter((r) => r.isActive).map((r) => r.label) };
  },

  /** Configuration: every option with the number of hazards on this form's assessments that use its name. */
  async list(user: CurrentUser, formId: string): Promise<HazardOptionDto[]> {
    requireRiskConfig(user);
    await loadRiskForm(prisma, formId);
    const [rows, versions] = await Promise.all([
      prisma.lookupValue.findMany({ where: { listKey: riskHazardListKey(formId) }, orderBy: { label: "asc" }, select }),
      prisma.formVersion.findMany({ where: { formId }, select: { id: true } }),
    ]);
    const used = await prisma.riskHazard.groupBy({
      by: ["name"],
      where: { assessment: { formVersionId: { in: versions.map((v) => v.id) } } },
      _count: { _all: true },
    });
    const counts = new Map<string, number>();
    for (const u of used) counts.set(normaliseLabel(u.name), (counts.get(normaliseLabel(u.name)) ?? 0) + u._count._all);
    return rows.map((r) => ({ ...r, usedCount: counts.get(normaliseLabel(r.label)) ?? 0 }));
  },

  async create(user: CurrentUser, formId: string, input: HazardOptionCreateInput, meta: RequestMeta): Promise<HazardOptionDto> {
    requireRiskConfig(user);
    const organizationId = requireTenantId();
    const listKey = riskHazardListKey(formId);
    const label = cleanLabel(input.label);
    try {
      return await prisma.$transaction(async (tx) => {
        const form = await loadRiskForm(tx, formId);
        await assertUniqueLabel(tx, listKey, label);
        const last = await tx.lookupValue.aggregate({ where: { listKey }, _max: { sortOrder: true } });
        const row = await tx.lookupValue.create({ data: { organizationId, listKey, label, sortOrder: (last._max.sortOrder ?? -1) + 1 }, select });
        await recordAudit({ entityType: ENTITY, entityId: row.id, action: "CREATED", actor: user, changes: { listKey, form: form.name, label }, meta }, tx);
        return { ...row, usedCount: 0 };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(`“${label}” is already in this list.`);
      throw error;
    }
  },

  /** Rename and/or switch on/off. Assessments keep the name they were saved with. */
  async update(user: CurrentUser, formId: string, id: string, input: HazardOptionUpdateInput, meta: RequestMeta): Promise<HazardOptionDto> {
    requireRiskConfig(user);
    const listKey = riskHazardListKey(formId);
    const before = await prisma.lookupValue.findFirst({ where: { id, listKey }, select });
    if (!before) throw new NotFoundError();
    const label = input.label !== undefined ? cleanLabel(input.label) : undefined;
    try {
      return await prisma.$transaction(async (tx) => {
        const form = await loadRiskForm(tx, formId);
        if (label !== undefined && label !== before.label) await assertUniqueLabel(tx, listKey, label, id);
        const data = { ...(label !== undefined ? { label } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) };
        const row = await tx.lookupValue.update({ where: { id }, data, select });
        const changes: Record<string, unknown> = { listKey, form: form.name };
        if (label !== undefined && label !== before.label) changes.label = { from: before.label, to: label };
        if (input.isActive !== undefined && input.isActive !== before.isActive) changes.isActive = { from: before.isActive, to: input.isActive };
        if (Object.keys(changes).length > 2) await recordAudit({ entityType: ENTITY, entityId: id, action: "UPDATED", actor: user, changes, meta }, tx);
        return { ...row, usedCount: 0 };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(`“${label}” is already in this list.`);
      throw error;
    }
  },

  /** Removes the option from the list; assessments that use the name keep it (stored as text). */
  async remove(user: CurrentUser, formId: string, id: string, meta: RequestMeta): Promise<void> {
    requireRiskConfig(user);
    const listKey = riskHazardListKey(formId);
    const before = await prisma.lookupValue.findFirst({ where: { id, listKey }, select });
    if (!before) throw new NotFoundError();
    await prisma.$transaction(async (tx) => {
      const form = await loadRiskForm(tx, formId);
      await tx.lookupValue.delete({ where: { id } });
      await recordAudit({ entityType: ENTITY, entityId: id, action: "DELETED", actor: user, changes: { listKey, form: form.name, label: before.label }, meta }, tx);
    });
  },
};
