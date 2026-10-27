import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ALL_PERMISSIONS, normalisePermissions, PERMISSIONS, SYSTEM_ROLE_KEYS } from "@/lib/permissions";
import { scopeKey, type ScopeTypeKey } from "@/lib/scope";
import type { Paginated } from "@/lib/validation/common";
import { paginate } from "@/lib/validation/common";
import type { AssignmentListQuery } from "@/lib/validation/configuration";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ConflictError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { cleanName, requireCompanyConfig } from "./config-access";
import { resolveScope, scopeLabels } from "./scope-labels";

/**
 * Roles & permissions. Roles are tenant data holding permission keys; a RoleAssignment pairs a
 * person with a role and a scope. The principal (and so every permission) is loaded per request,
 * so changes take effect on the person's next request.
 */

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** The Administrator role always holds every permission (not editable). */
  isAdministrator: boolean;
  permissions: string[];
  version: number;
  assignmentCount: number;
  directoryUserCount: number;
  updatedAt: string;
}

export interface AssignmentRowDto {
  id: string;
  user: { id: string; name: string; email: string; isActive: boolean };
  role: { id: string; name: string };
  scopeType: ScopeTypeKey;
  scopeId: string | null;
  scopeLabel: string;
  isProtected: boolean;
  createdAt: string;
}

const roleInclude = { _count: { select: { assignments: true, directoryUsers: true } } } satisfies Prisma.RoleInclude;

type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

function toRoleDto(r: RoleRow): RoleDto {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isAdministrator: r.key === SYSTEM_ROLE_KEYS.ADMINISTRATOR,
    permissions: r.permissions,
    version: r.version,
    assignmentCount: r._count.assignments,
    directoryUserCount: r._count.directoryUsers,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "role"
  );
}

/** Unique role key within the tenant ("site-coordinator", "site-coordinator-2", …). */
export async function uniqueRoleKey(db: DbClient, name: string, taken: Set<string> = new Set()): Promise<string> {
  const base = slugify(name);
  const existing = await db.role.findMany({ where: { key: { startsWith: base } }, select: { key: true } });
  const used = new Set([...existing.map((r) => r.key), ...taken]);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

export async function assertUniqueRoleName(db: DbClient, name: string, excludeId?: string) {
  const clash = await db.role.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ConflictError(`A role called "${name}" already exists.`);
}

/**
 * Inserts a person + role + scope assignment inside the caller's transaction (no permission
 * check – callers do that: Assignments needs Manage roles, the initial role of a new user is
 * part of Manage users). Identical combinations are rejected.
 */
export async function insertAssignment(
  tx: DbClient,
  input: { userId: string; roleId: string; scopeType: ScopeTypeKey; scopeId: string | null },
  actor: CurrentUser,
  meta: RequestMeta,
): Promise<{ id: string; scopeLabel: string }> {
  const [user, role] = await Promise.all([
    tx.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, isActive: true } }),
    tx.role.findUnique({ where: { id: input.roleId }, select: { id: true, name: true } }),
  ]);
  if (!user) throw new ValidationError("Choose an existing person.", [{ path: "userId", message: "Choose a person" }]);
  if (!user.isActive) throw new BusinessRuleError(`${user.name} is deactivated. Reactivate them first.`);
  if (!role) throw new ValidationError("Choose an existing role.", [{ path: "roleId", message: "Choose a role" }]);
  const scope = await resolveScope(tx, input);
  const existing = await tx.roleAssignment.findFirst({ where: { userId: user.id, roleId: role.id, scopeKey: scope.scopeKey }, select: { id: true } });
  if (existing) throw new ConflictError(`${user.name} already has ${role.name} for ${scope.label}.`);
  const row = await tx.roleAssignment.create({
    data: {
      organizationId: actor.organizationId,
      userId: user.id,
      roleId: role.id,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      scopeKey: scope.scopeKey,
      createdById: actor.id,
    },
    select: { id: true },
  });
  await recordAudit(
    {
      entityType: "RoleAssignment",
      entityId: row.id,
      action: "ASSIGNED",
      actor,
      changes: { user: user.name, role: role.name, scope: scope.label },
      metadata: { userId: user.id, roleId: role.id, scopeKey: scope.scopeKey },
      meta,
    },
    tx,
  );
  return { id: row.id, scopeLabel: scope.label };
}

export const roleService = {
  async list(q: string | undefined, actor: CurrentUser): Promise<RoleDto[]> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ROLES);
    const rows = await prisma.role.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : {},
      include: roleInclude,
      orderBy: { name: "asc" },
    });
    return rows.map(toRoleDto);
  },

  async get(id: string, actor: CurrentUser): Promise<RoleDto> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ROLES);
    const row = await prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!row) throw new NotFoundError();
    return toRoleDto(row);
  },

  /** Creates a named EMPTY role (no permissions are copied from anywhere). */
  async create(input: { name: string; description: string | null }, actor: CurrentUser, meta: RequestMeta): Promise<RoleDto> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ROLES);
    const name = cleanName(input.name);
    try {
      return await prisma.$transaction(async (tx) => {
        await assertUniqueRoleName(tx, name);
        const key = await uniqueRoleKey(tx, name);
        const row = await tx.role.create({
          data: { organizationId: actor.organizationId, key, name, description: input.description, permissions: [] },
          include: roleInclude,
        });
        await recordAudit({ entityType: "Role", entityId: row.id, action: "CREATED", actor, changes: { name, description: input.description, permissions: [] }, meta }, tx);
        return toRoleDto(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(`A role called "${name}" already exists.`);
      throw error;
    }
  },

  /**
   * Saves name/description/permissions. Permission dependencies are enforced here too
   * (normalisePermissions), and the editor's `expectedVersion` must still be current.
   */
  async update(
    id: string,
    input: { name?: string; description?: string | null; permissions?: string[]; expectedVersion: number },
    actor: CurrentUser,
    meta: RequestMeta,
  ): Promise<RoleDto> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ROLES);
    return prisma.$transaction(async (tx) => {
      const before = await tx.role.findUnique({ where: { id } });
      if (!before) throw new NotFoundError();
      const isAdmin = before.key === SYSTEM_ROLE_KEYS.ADMINISTRATOR;
      const data: Prisma.RoleUpdateManyMutationInput = {};
      const changes: Record<string, unknown> = {};

      if (input.name !== undefined) {
        const name = cleanName(input.name);
        if (name !== before.name) {
          await assertUniqueRoleName(tx, name, id);
          data.name = name;
          changes.name = { from: before.name, to: name };
        }
      }
      if (input.description !== undefined && input.description !== before.description) {
        data.description = input.description;
        changes.description = { from: before.description, to: input.description };
      }
      if (input.permissions !== undefined) {
        const next = isAdmin ? ALL_PERMISSIONS : normalisePermissions(input.permissions);
        if (isAdmin && normalisePermissions(input.permissions).length !== ALL_PERMISSIONS.length) {
          throw new BusinessRuleError("The Administrator role always has every permission. Create another role for limited access.");
        }
        const added = next.filter((p) => !before.permissions.includes(p));
        const removed = before.permissions.filter((p) => !(next as string[]).includes(p));
        if (added.length || removed.length) {
          data.permissions = next;
          changes.permissions = { added, removed };
        }
      }

      // Nothing changed: only confirm the editor was looking at the current version.
      const updated = Object.keys(data).length
        ? await tx.role.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } })
        : { count: before.version === input.expectedVersion ? 1 : 0 };
      if (updated.count === 0) throw new StaleVersionError("This role was changed by someone else – reload to see their changes.");
      if (Object.keys(changes).length) await recordAudit({ entityType: "Role", entityId: id, action: "UPDATED", actor, changes, meta }, tx);
      const row = await tx.role.findUniqueOrThrow({ where: { id }, include: roleInclude });
      return toRoleDto(row);
    });
  },

  /** Only non-system roles nobody holds can be deleted (directory references are cleared). */
  async delete(id: string, actor: CurrentUser, meta: RequestMeta): Promise<void> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ROLES);
    await prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id }, include: roleInclude });
      if (!role) throw new NotFoundError();
      if (role.isSystem) throw new BusinessRuleError("Built-in roles cannot be deleted. Remove their permissions instead.");
      if (role._count.assignments > 0) {
        throw new BusinessRuleError(`${role._count.assignments} assignment${role._count.assignments === 1 ? "" : "s"} still ${role._count.assignments === 1 ? "uses" : "use"} this role. Remove them first.`);
      }
      await tx.role.delete({ where: { id } });
      await recordAudit({ entityType: "Role", entityId: id, action: "DELETED", actor, changes: { name: role.name, permissions: role.permissions }, meta }, tx);
    });
  },
};

export const assignmentService = {
  async list(query: AssignmentListQuery, actor: CurrentUser): Promise<Paginated<AssignmentRowDto>> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ROLES);
    const where: Prisma.RoleAssignmentWhereInput = {
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.scopeType ? { scopeType: query.scopeType } : {}),
      ...(query.q ? { user: { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }] } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.roleAssignment.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, isActive: true } }, role: { select: { id: true, name: true } } },
        orderBy: [{ user: { name: "asc" } }, { role: { name: "asc" } }, { createdAt: "asc" }],
        ...paginate(query),
      }),
      prisma.roleAssignment.count({ where }),
    ]);
    const labels = await scopeLabels(prisma, rows);
    return {
      items: rows.map((r) => ({
        id: r.id,
        user: r.user,
        role: r.role,
        scopeType: r.scopeType,
        scopeId: r.scopeId,
        scopeLabel: labels.get(scopeKey({ type: r.scopeType, id: r.scopeId })) ?? "",
        isProtected: r.isProtected,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  /** Adds one person + role + scope (identical combinations are rejected). */
  async create(
    input: { userId: string; roleId: string; scopeType: ScopeTypeKey; scopeId: string | null },
    actor: CurrentUser,
    meta: RequestMeta,
  ): Promise<{ id: string; scopeLabel: string }> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ROLES);
    try {
      return await prisma.$transaction((tx) => insertAssignment(tx, input, actor, meta));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError("This person already has that role for this scope.");
      throw error;
    }
  },

  /** Removes one assignment; the protected owner assignment stays. */
  async remove(id: string, actor: CurrentUser, meta: RequestMeta): Promise<void> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_ROLES);
    await prisma.$transaction(async (tx) => {
      const row = await tx.roleAssignment.findUnique({ where: { id }, include: { user: { select: { name: true } }, role: { select: { name: true } } } });
      if (!row) throw new NotFoundError();
      if (row.isProtected) throw new BusinessRuleError("The company owner's administrator assignment cannot be removed.");
      await tx.roleAssignment.delete({ where: { id } });
      const labels = await scopeLabels(tx, [row]);
      await recordAudit(
        {
          entityType: "RoleAssignment",
          entityId: id,
          action: "UNASSIGNED",
          actor,
          changes: { user: row.user.name, role: row.role.name, scope: labels.get(row.scopeKey) ?? row.scopeKey },
          metadata: { userId: row.userId, roleId: row.roleId, scopeKey: row.scopeKey },
          meta,
        },
        tx,
      );
    });
  },
};
