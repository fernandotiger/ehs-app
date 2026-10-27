import "server-only";
import { hashPassword } from "better-auth/crypto";
import { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS } from "@/lib/permissions";
import { scopeKey } from "@/lib/scope";
import type { Paginated } from "@/lib/validation/common";
import { paginate } from "@/lib/validation/common";
import type { UserCreateValues, UserListQuery, UserUpdateValues } from "@/lib/validation/configuration";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, systemPrisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/server/http/errors";
import { resolvePlacement } from "@/server/modules/organisation/placement";
import { cleanName, requireCompanyConfig } from "./config-access";
import { insertAssignment } from "./role.service";
import { scopeLabels } from "./scope-labels";

/**
 * Configuration → Users: the company directory. A person is either able to sign in (has a
 * credential account with a password set by an administrator) or "directory only" (can be
 * assigned work and roles, but has no sign-in). No invitation e-mail is sent – sending is not
 * connected in this build.
 */

export interface UserRowDto {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  isActive: boolean;
  canSignIn: boolean;
  /** Holds the protected owner assignment (cannot be deactivated). */
  isOwner: boolean;
  department: { id: string; name: string } | null;
  placementLabel: string | null;
  manager: { id: string; name: string } | null;
  roles: string[];
  assignmentCount: number;
  directoryRole: { id: string; name: string } | null;
  createdAt: string;
}

export interface UserDetailDto extends UserRowDto {
  departmentId: string | null;
  managerId: string | null;
  assignments: { id: string; role: string; scopeLabel: string; isProtected: boolean }[];
}

const userInclude = {
  department: { select: { id: true, name: true } },
  location: { select: { name: true } },
  site: { select: { name: true } },
  manager: { select: { id: true, name: true } },
  directoryRole: { select: { id: true, name: true } },
  accounts: { where: { providerId: "credential" }, select: { id: true } },
  roleAssignments: { select: { id: true, isProtected: true, scopeType: true, scopeId: true, role: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function toRow(u: UserRow): UserRowDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    jobTitle: u.jobTitle,
    isActive: u.isActive,
    canSignIn: u.accounts.length > 0,
    isOwner: u.roleAssignments.some((a) => a.isProtected),
    department: u.department,
    placementLabel: [u.site?.name, u.location?.name, u.department?.name].filter(Boolean).join(" · ") || null,
    manager: u.manager,
    roles: [...new Set(u.roleAssignments.map((a) => a.role.name))],
    assignmentCount: u.roleAssignments.length,
    directoryRole: u.directoryRole,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Email is globally unique (one person = one tenant) – checked without revealing which tenant. */
async function assertEmailFree(email: string, excludeUserId?: string) {
  const existing = await systemPrisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== excludeUserId) {
    throw new ConflictError("Someone with this email address already exists.", [{ path: "email", message: "This email is already in use" }]);
  }
}

async function placementFor(db: DbClient, departmentId: string | null) {
  if (!departmentId) return { businessUnitId: null, siteId: null, locationId: null, departmentId: null };
  const department = await db.department.findUnique({ where: { id: departmentId }, select: { isActive: true, name: true } });
  if (!department) throw new ValidationError("Choose an existing department.", [{ path: "departmentId", message: "Choose a department" }]);
  if (!department.isActive) throw new ValidationError(`"${department.name}" is inactive.`, [{ path: "departmentId", message: "Choose an active department" }]);
  return resolvePlacement({ departmentId }, db);
}

/** Manager must exist, be active and not create a reporting loop. */
async function checkManager(db: DbClient, managerId: string | null, userId?: string): Promise<string | null> {
  if (!managerId) return null;
  if (managerId === userId) throw new ValidationError("A person cannot be their own manager.", [{ path: "managerId", message: "Choose someone else" }]);
  const manager = await db.user.findUnique({ where: { id: managerId }, select: { id: true, isActive: true, managerId: true } });
  if (!manager || !manager.isActive) throw new ValidationError("Choose an active manager.", [{ path: "managerId", message: "Choose an active person" }]);
  if (userId) {
    let next: string | null = manager.managerId;
    for (let i = 0; next && i < 50; i++) {
      if (next === userId) throw new ValidationError("That would create a reporting loop.", [{ path: "managerId", message: "This person reports to them" }]);
      next = (await db.user.findUnique({ where: { id: next }, select: { managerId: true } }))?.managerId ?? null;
    }
  }
  return manager.id;
}

async function setCredentialPassword(db: DbClient, userId: string, password: string) {
  const hash = await hashPassword(password);
  const account = await db.account.findFirst({ where: { userId, providerId: "credential" }, select: { id: true } });
  if (account) await db.account.update({ where: { id: account.id }, data: { password: hash } });
  else await db.account.create({ data: { userId, accountId: userId, providerId: "credential", password: hash } });
}

export const userAdminService = {
  async list(query: UserListQuery, actor: CurrentUser): Promise<Paginated<UserRowDto>> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_USERS);
    const where: Prisma.UserWhereInput = {
      ...(query.status === "all" ? {} : { isActive: query.status === "active" }),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.roleId ? { roleAssignments: { some: { roleId: query.roleId } } } : {}),
      ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, include: userInclude, orderBy: [{ name: "asc" }, { email: "asc" }], ...paginate(query) }),
      prisma.user.count({ where }),
    ]);
    return { items: rows.map(toRow), total, page: query.page, pageSize: query.pageSize };
  },

  async get(id: string, actor: CurrentUser): Promise<UserDetailDto> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_USERS);
    const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
    if (!user) throw new NotFoundError();
    const labels = await scopeLabels(prisma, user.roleAssignments);
    return {
      ...toRow(user),
      departmentId: user.departmentId,
      managerId: user.managerId,
      assignments: user.roleAssignments.map((a) => ({
        id: a.id,
        role: a.role.name,
        scopeLabel: labels.get(scopeKey({ type: a.scopeType, id: a.scopeId })) ?? "",
        isProtected: a.isProtected,
      })),
    };
  },

  /** Adds a directory person with an initial scoped assignment (and optionally a sign-in). */
  async create(input: UserCreateValues, actor: CurrentUser, meta: RequestMeta): Promise<{ id: string; canSignIn: boolean; invitationSent: false }> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_USERS);
    const email = input.email.trim().toLowerCase();
    const name = cleanName(input.name);
    await assertEmailFree(email);
    try {
      return await prisma.$transaction(async (tx) => {
        const placement = await placementFor(tx, input.departmentId);
        const managerId = await checkManager(tx, input.managerId);
        const user = await tx.user.create({
          data: {
            organizationId: actor.organizationId,
            name,
            email,
            emailVerified: false,
            jobTitle: input.jobTitle,
            managerId,
            ...placement,
          },
          select: { id: true },
        });
        if (input.access === "password") await setCredentialPassword(tx, user.id, input.password!);
        await recordAudit(
          {
            entityType: "User",
            entityId: user.id,
            action: "CREATED",
            actor,
            changes: { name, email, jobTitle: input.jobTitle, departmentId: placement.departmentId, managerId, canSignIn: input.access === "password" },
            metadata: { invitationSent: false },
            meta,
          },
          tx,
        );
        // Initial scoped assignment (same rules and audit as Roles & permissions → Assignments).
        await insertAssignment(tx, { userId: user.id, roleId: input.roleId, scopeType: input.scopeType, scopeId: input.scopeId }, actor, meta);
        return { id: user.id, canSignIn: input.access === "password", invitationSent: false as const };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError("Someone with this email address already exists.");
      throw error;
    }
  },

  /** Name, email, job title, department (placement) and manager. Assignments are untouched. */
  async update(id: string, input: UserUpdateValues, actor: CurrentUser, meta: RequestMeta): Promise<UserDetailDto> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_USERS);
    const email = input.email.trim().toLowerCase();
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundError();
    if (email !== before.email) await assertEmailFree(email, id);
    try {
      await prisma.$transaction(async (tx) => {
        const placement = input.departmentId === before.departmentId ? null : await placementFor(tx, input.departmentId);
        const managerId = input.managerId === before.managerId ? before.managerId : await checkManager(tx, input.managerId, id);
        const data = {
          name: cleanName(input.name),
          email,
          jobTitle: input.jobTitle,
          managerId,
          ...(placement ?? {}),
          ...(email !== before.email ? { emailVerified: false } : {}),
        };
        await tx.user.update({ where: { id }, data });
        const changes = diff(before as unknown as Record<string, unknown>, data, ["name", "email", "jobTitle", "managerId", "departmentId"]);
        if (changes) await recordAudit({ entityType: "User", entityId: id, action: "UPDATED", actor, changes, meta }, tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError("Someone with this email address already exists.");
      throw error;
    }
    return this.get(id, actor);
  },

  /** Deactivating revokes every session; yourself and the protected owner cannot be deactivated. */
  async setActive(id: string, isActive: boolean, actor: CurrentUser, meta: RequestMeta): Promise<{ id: string; isActive: boolean; sessionsRevoked: number }> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_USERS);
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, name: true, isActive: true, roleAssignments: { where: { isProtected: true }, select: { id: true } } } });
      if (!user) throw new NotFoundError();
      if (!isActive && user.id === actor.id) throw new BusinessRuleError("You cannot deactivate your own account.");
      if (!isActive && user.roleAssignments.length) throw new BusinessRuleError(`${user.name} is the company owner and cannot be deactivated.`);
      if (user.isActive === isActive) return { id, isActive, sessionsRevoked: 0 };
      await tx.user.update({ where: { id }, data: { isActive } });
      // Session is a global auth table; the user was verified above through the tenant-scoped client.
      const revoked = isActive ? 0 : (await tx.session.deleteMany({ where: { userId: id } })).count;
      await recordAudit(
        { entityType: "User", entityId: id, action: isActive ? "REACTIVATED" : "DEACTIVATED", actor, changes: { isActive: { from: !isActive, to: isActive } }, metadata: { sessionsRevoked: revoked }, meta },
        tx,
      );
      return { id, isActive, sessionsRevoked: revoked };
    });
  },

  /** Sets a new (temporary) password – also gives a directory-only person a sign-in. */
  async setPassword(id: string, password: string, actor: CurrentUser, meta: RequestMeta): Promise<{ id: string; canSignIn: true }> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_USERS);
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, name: true, isActive: true, accounts: { where: { providerId: "credential" }, select: { id: true } } } });
      if (!user) throw new NotFoundError();
      if (!user.isActive) throw new BusinessRuleError(`${user.name} is deactivated. Reactivate them first.`);
      const hadSignIn = user.accounts.length > 0;
      await setCredentialPassword(tx, id, password);
      // Other people's existing sessions end so the new password takes effect everywhere.
      const revoked = id === actor.id ? 0 : (await tx.session.deleteMany({ where: { userId: id } })).count;
      await recordAudit(
        { entityType: "User", entityId: id, action: hadSignIn ? "PASSWORD_RESET" : "SIGN_IN_ENABLED", actor, changes: null, metadata: { sessionsRevoked: revoked }, meta },
        tx,
      );
    });
    return { id, canSignIn: true };
  },
};
