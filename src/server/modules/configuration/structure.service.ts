import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS } from "@/lib/permissions";
import {
  STRUCTURE_LEVEL_META,
  type StructureLevel,
  type StructureListQuery,
  type StructureNodeValues,
} from "@/lib/validation/configuration";
import type { Paginated } from "@/lib/validation/common";
import { paginate } from "@/lib/validation/common";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/server/http/errors";
import { repositionDescendants } from "@/server/modules/organisation/placed-models";
import { cleanName, requireCompanyConfig } from "./config-access";

/**
 * Company structure: Business unit → Site → Location → Department.
 * Every node stores its ancestors; a new parent re-derives them for the node, its descendants
 * and every placed record (users, module records) via repositionDescendants(). Nodes are
 * deactivated, never deleted. Names are unique (case-insensitive) under the same parent.
 */

export interface StructureRowDto {
  id: string;
  name: string;
  code: string | null;
  notes: string | null;
  isActive: boolean;
  parentId: string | null;
  parentName: string | null;
  /** Ancestors, e.g. "Operations › Dublin Plant" for a location. */
  path: string | null;
  childCount: number;
  userCount: number;
  updatedAt: string;
}

const ENTITY: Record<StructureLevel, string> = {
  "business-units": "BusinessUnit",
  sites: "Site",
  locations: "Location",
  departments: "Department",
};

const activeUsers = { where: { isActive: true } } as const;
const activeChildren = { where: { isActive: true } } as const;

function nameFilter(q: string | undefined) {
  return q
    ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] }
    : {};
}

function statusFilter(status: StructureListQuery["status"]) {
  return status === "all" ? {} : { isActive: status === "active" };
}

function joinPath(...parts: (string | null | undefined)[]): string | null {
  const list = parts.filter(Boolean);
  return list.length ? list.join(" › ") : null;
}

function base(row: { id: string; name: string; code: string | null; notes: string | null; isActive: boolean; updatedAt: Date }) {
  return { id: row.id, name: row.name, code: row.code, notes: row.notes, isActive: row.isActive, updatedAt: row.updatedAt.toISOString() };
}

/** Parent of `level` loaded through the tenant-scoped client (unknown/foreign ids are rejected). */
async function loadParent(db: DbClient, level: StructureLevel, parentId: string | null) {
  const meta = STRUCTURE_LEVEL_META[level];
  if (!meta.parent) return null;
  const parentLabel = STRUCTURE_LEVEL_META[meta.parent].label.toLowerCase();
  if (!parentId) throw new ValidationError(`Choose the ${parentLabel} this ${meta.label.toLowerCase()} belongs to.`, [{ path: "parentId", message: `Choose a ${parentLabel}` }]);
  const notFound = () => new ValidationError(`Choose an existing ${parentLabel}.`, [{ path: "parentId", message: `Choose an existing ${parentLabel}` }]);
  if (level === "sites") {
    const bu = await db.businessUnit.findUnique({ where: { id: parentId } });
    if (!bu) throw notFound();
    return { id: bu.id, name: bu.name, isActive: bu.isActive, ancestors: { businessUnitId: bu.id } };
  }
  if (level === "locations") {
    const site = await db.site.findUnique({ where: { id: parentId } });
    if (!site) throw notFound();
    return { id: site.id, name: site.name, isActive: site.isActive, ancestors: { businessUnitId: site.businessUnitId, siteId: site.id } };
  }
  const location = await db.location.findUnique({ where: { id: parentId } });
  if (!location) throw notFound();
  return {
    id: location.id,
    name: location.name,
    isActive: location.isActive,
    ancestors: { businessUnitId: location.businessUnitId, siteId: location.siteId, locationId: location.id },
  };
}

/** Case-insensitive duplicate under the same parent (business units: across the company). */
async function assertUniqueName(db: DbClient, level: StructureLevel, name: string, parentId: string | null, excludeId?: string) {
  const where = { name: { equals: name, mode: "insensitive" as const }, ...(excludeId ? { id: { not: excludeId } } : {}) };
  let clash: { id: string } | null;
  switch (level) {
    case "business-units":
      clash = await db.businessUnit.findFirst({ where, select: { id: true } });
      break;
    case "sites":
      clash = await db.site.findFirst({ where: { ...where, businessUnitId: parentId! }, select: { id: true } });
      break;
    case "locations":
      clash = await db.location.findFirst({ where: { ...where, siteId: parentId! }, select: { id: true } });
      break;
    case "departments":
      clash = await db.department.findFirst({ where: { ...where, locationId: parentId! }, select: { id: true } });
      break;
  }
  if (clash) {
    const label = STRUCTURE_LEVEL_META[level].label.toLowerCase();
    throw new ConflictError(level === "business-units" ? `A business unit called "${name}" already exists.` : `A ${label} called "${name}" already exists there.`);
  }
}

async function loadNode(db: DbClient, level: StructureLevel, id: string) {
  switch (level) {
    case "business-units": {
      const n = await db.businessUnit.findUnique({ where: { id } });
      return n && { ...n, parentId: null as string | null };
    }
    case "sites": {
      const n = await db.site.findUnique({ where: { id } });
      return n && { ...n, parentId: n.businessUnitId as string | null };
    }
    case "locations": {
      const n = await db.location.findUnique({ where: { id } });
      return n && { ...n, parentId: n.siteId as string | null };
    }
    case "departments": {
      const n = await db.department.findUnique({ where: { id } });
      return n && { ...n, parentId: n.locationId as string | null };
    }
  }
}

async function activeChildCount(db: DbClient, level: StructureLevel, id: string): Promise<number> {
  switch (level) {
    case "business-units":
      return db.site.count({ where: { businessUnitId: id, isActive: true } });
    case "sites":
      return db.location.count({ where: { siteId: id, isActive: true } });
    case "locations":
      return db.department.count({ where: { locationId: id, isActive: true } });
    default:
      return 0;
  }
}

function rethrowUnique(error: unknown, name: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictError(`"${name}" already exists there.`);
  }
  throw error;
}

export const structureService = {
  async list(level: StructureLevel, query: StructureListQuery, actor: CurrentUser): Promise<Paginated<StructureRowDto>> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ORGANISATION);
    const where = { ...statusFilter(query.status), ...nameFilter(query.q) };
    const page = paginate(query);
    const orderBy = [{ name: "asc" as const }];

    switch (level) {
      case "business-units": {
        const [rows, total] = await Promise.all([
          prisma.businessUnit.findMany({ where, orderBy, ...page, include: { _count: { select: { sites: activeChildren, users: activeUsers } } } }),
          prisma.businessUnit.count({ where }),
        ]);
        const items = rows.map((r) => ({ ...base(r), parentId: null, parentName: null, path: null, childCount: r._count.sites, userCount: r._count.users }));
        return { items, total, page: query.page, pageSize: query.pageSize };
      }
      case "sites": {
        const scoped = { ...where, ...(query.parentId ? { businessUnitId: query.parentId } : {}) };
        const [rows, total] = await Promise.all([
          prisma.site.findMany({
            where: scoped,
            orderBy,
            ...page,
            include: { businessUnit: { select: { name: true } }, _count: { select: { locations: activeChildren, users: activeUsers } } },
          }),
          prisma.site.count({ where: scoped }),
        ]);
        const items = rows.map((r) => ({
          ...base(r),
          parentId: r.businessUnitId,
          parentName: r.businessUnit.name,
          path: r.businessUnit.name,
          childCount: r._count.locations,
          userCount: r._count.users,
        }));
        return { items, total, page: query.page, pageSize: query.pageSize };
      }
      case "locations": {
        const scoped = { ...where, ...(query.parentId ? { siteId: query.parentId } : {}) };
        const [rows, total] = await Promise.all([
          prisma.location.findMany({
            where: scoped,
            orderBy,
            ...page,
            include: {
              site: { select: { name: true } },
              businessUnit: { select: { name: true } },
              _count: { select: { departments: activeChildren, users: activeUsers } },
            },
          }),
          prisma.location.count({ where: scoped }),
        ]);
        const items = rows.map((r) => ({
          ...base(r),
          parentId: r.siteId,
          parentName: r.site.name,
          path: joinPath(r.businessUnit.name, r.site.name),
          childCount: r._count.departments,
          userCount: r._count.users,
        }));
        return { items, total, page: query.page, pageSize: query.pageSize };
      }
      case "departments": {
        const scoped = { ...where, ...(query.parentId ? { locationId: query.parentId } : {}) };
        const [rows, total] = await Promise.all([
          prisma.department.findMany({
            where: scoped,
            orderBy,
            ...page,
            include: {
              location: { select: { name: true } },
              site: { select: { name: true } },
              businessUnit: { select: { name: true } },
              _count: { select: { users: activeUsers } },
            },
          }),
          prisma.department.count({ where: scoped }),
        ]);
        const items = rows.map((r) => ({
          ...base(r),
          parentId: r.locationId,
          parentName: r.location.name,
          path: joinPath(r.businessUnit.name, r.site.name, r.location.name),
          childCount: 0,
          userCount: r._count.users,
        }));
        return { items, total, page: query.page, pageSize: query.pageSize };
      }
    }
  },

  /** Counts per level (tab badges). */
  async counts(actor: CurrentUser) {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ORGANISATION);
    const active = { isActive: true };
    const [businessUnits, sites, locations, departments] = await Promise.all([
      prisma.businessUnit.count({ where: active }),
      prisma.site.count({ where: active }),
      prisma.location.count({ where: active }),
      prisma.department.count({ where: active }),
    ]);
    return { "business-units": businessUnits, sites, locations, departments } satisfies Record<StructureLevel, number>;
  },

  async create(level: StructureLevel, input: StructureNodeValues, actor: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ORGANISATION);
    const organizationId = actor.organizationId;
    const name = cleanName(input.name);
    const common = { organizationId, name, code: input.code, notes: input.notes };
    try {
      return await prisma.$transaction(async (tx) => {
        const parent = await loadParent(tx, level, input.parentId);
        if (parent && !parent.isActive) throw new BusinessRuleError(`"${parent.name}" is inactive. Reactivate it or choose another parent.`);
        await assertUniqueName(tx, level, name, parent?.id ?? null);
        let id: string;
        switch (level) {
          case "business-units":
            id = (await tx.businessUnit.create({ data: common, select: { id: true } })).id;
            break;
          case "sites":
            id = (await tx.site.create({ data: { ...common, businessUnitId: parent!.ancestors.businessUnitId }, select: { id: true } })).id;
            break;
          case "locations": {
            const a = parent!.ancestors as { businessUnitId: string; siteId: string };
            id = (await tx.location.create({ data: { ...common, ...a }, select: { id: true } })).id;
            break;
          }
          case "departments": {
            const a = parent!.ancestors as { businessUnitId: string; siteId: string; locationId: string };
            id = (await tx.department.create({ data: { ...common, ...a }, select: { id: true } })).id;
            break;
          }
        }
        await recordAudit(
          { entityType: ENTITY[level], entityId: id, action: "CREATED", actor, changes: { name, code: input.code, notes: input.notes, parent: parent?.name ?? null }, meta },
          tx,
        );
        return { id };
      });
    } catch (error) {
      rethrowUnique(error, name);
    }
  },

  async update(level: StructureLevel, id: string, input: StructureNodeValues, actor: CurrentUser, meta: RequestMeta): Promise<{ id: string; repositioned: Record<string, number> | null }> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ORGANISATION);
    const name = cleanName(input.name);
    try {
      return await prisma.$transaction(async (tx) => {
        const before = await loadNode(tx, level, id);
        if (!before) throw new NotFoundError();
        const parentId = STRUCTURE_LEVEL_META[level].parent ? input.parentId : null;
        const parent = await loadParent(tx, level, parentId);
        const parentChanged = Boolean(parent) && parent!.id !== before.parentId;
        if (parentChanged && !parent!.isActive) throw new BusinessRuleError(`"${parent!.name}" is inactive. Choose an active parent.`);
        await assertUniqueName(tx, level, name, parent?.id ?? null, id);

        const data = { name, code: input.code, notes: input.notes };
        let repositioned: Record<string, number> | null = null;
        switch (level) {
          case "business-units":
            await tx.businessUnit.update({ where: { id }, data });
            break;
          case "sites": {
            const a = parent!.ancestors as { businessUnitId: string };
            await tx.site.update({ where: { id }, data: { ...data, ...a } });
            if (parentChanged) repositioned = await repositionDescendants(tx, "SITE", id, a);
            break;
          }
          case "locations": {
            const a = parent!.ancestors as { businessUnitId: string; siteId: string };
            await tx.location.update({ where: { id }, data: { ...data, ...a } });
            if (parentChanged) repositioned = await repositionDescendants(tx, "LOCATION", id, a);
            break;
          }
          case "departments": {
            const a = parent!.ancestors as { businessUnitId: string; siteId: string; locationId: string };
            await tx.department.update({ where: { id }, data: { ...data, ...a } });
            if (parentChanged) repositioned = await repositionDescendants(tx, "DEPARTMENT", id, a);
            break;
          }
        }
        const changes = diff({ name: before.name, code: before.code, notes: before.notes, parentId: before.parentId }, { ...data, parentId: parent?.id ?? null });
        if (changes) {
          await recordAudit(
            { entityType: ENTITY[level], entityId: id, action: parentChanged ? "MOVED" : "UPDATED", actor, changes, metadata: repositioned ? { repositioned } : null, meta },
            tx,
          );
        }
        return { id, repositioned };
      });
    } catch (error) {
      rethrowUnique(error, name);
    }
  },

  /** Deactivate (no active children allowed) or reactivate (parent must be active). */
  async setActive(level: StructureLevel, id: string, isActive: boolean, actor: CurrentUser, meta: RequestMeta): Promise<{ id: string; isActive: boolean }> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ORGANISATION);
    return prisma.$transaction(async (tx) => {
      const node = await loadNode(tx, level, id);
      if (!node) throw new NotFoundError();
      if (node.isActive === isActive) return { id, isActive };
      const metaLevel = STRUCTURE_LEVEL_META[level];
      if (!isActive) {
        const children = await activeChildCount(tx, level, id);
        if (children > 0 && metaLevel.child) {
          const childLabel = STRUCTURE_LEVEL_META[metaLevel.child].plural.toLowerCase();
          throw new BusinessRuleError(`"${node.name}" still has ${children} active ${children === 1 ? childLabel.replace(/s$/, "") : childLabel}. Deactivate or move them first.`);
        }
      } else if (metaLevel.parent && node.parentId) {
        const parent = await loadParent(tx, level, node.parentId);
        if (parent && !parent.isActive) throw new BusinessRuleError(`Reactivate "${parent.name}" first.`);
      }
      const data = { isActive };
      switch (level) {
        case "business-units":
          await tx.businessUnit.update({ where: { id }, data });
          break;
        case "sites":
          await tx.site.update({ where: { id }, data });
          break;
        case "locations":
          await tx.location.update({ where: { id }, data });
          break;
        case "departments":
          await tx.department.update({ where: { id }, data });
          break;
      }
      await recordAudit(
        { entityType: ENTITY[level], entityId: id, action: isActive ? "REACTIVATED" : "DEACTIVATED", actor, changes: { isActive: { from: !isActive, to: isActive } }, meta },
        tx,
      );
      return { id, isActive };
    });
  },
};
