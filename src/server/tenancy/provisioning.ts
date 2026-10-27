/**
 * Tenant provisioning – creates a company with its defaults and first administrator.
 *
 * Deliberately WITHOUT `import "server-only"` and without the tenant-scoped client: it runs from
 * tsx scripts (scripts/create-tenant.ts, prisma/seed.ts) and from future platform-admin
 * endpoints, always with an UNSCOPED PrismaClient passed in. Every write sets organizationId
 * explicitly. Re-running for an existing slug tops up missing defaults (idempotent) unless
 * `failIfExists` is set.
 */
import { hashPassword } from "better-auth/crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { DEFAULT_ROLES } from "../../lib/default-roles";
import { LOOKUP_LISTS } from "../../lib/lookups";
import { MODULE_KEYS, isModuleKey, type ModuleKey } from "../../lib/modules";
import { ALL_PERMISSIONS, SYSTEM_ROLE_KEYS } from "../../lib/permissions";
import { SETTINGS, type SettingKey } from "../../lib/settings/registry";
import { ensureIncidentCatalogue } from "../modules/incidents/catalogue";

export interface ProvisionTenantInput {
  name: string;
  /** URL-safe handle, unique across the platform. */
  slug: string;
  adminEmail: string;
  adminName: string;
  /** Initial password for the administrator (min. 8 characters). */
  password: string;
  /** Enabled modules (default: all). */
  modules?: readonly string[];
  timeZone?: string;
  locale?: string;
  plan?: string;
  branding?: { primary?: string; secondary?: string; tertiary?: string };
  /** Throw when the slug already exists instead of topping up its defaults. */
  failIfExists?: boolean;
}

export interface ProvisionTenantResult {
  organizationId: string;
  adminUserId: string;
  /** Role key → id */
  roles: Map<string, string>;
  created: boolean;
}

export class ProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisioningError";
  }
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseModules(modules: readonly string[] | undefined): ModuleKey[] {
  if (!modules) return [...MODULE_KEYS];
  const unknown = modules.filter((m) => !isModuleKey(m));
  if (unknown.length) throw new ProvisioningError(`Unknown module(s): ${unknown.join(", ")}. Valid: ${MODULE_KEYS.join(", ")}`);
  return MODULE_KEYS.filter((m) => modules.includes(m));
}

function validate(input: ProvisionTenantInput) {
  if (!input.name.trim()) throw new ProvisioningError("Organisation name is required");
  if (!SLUG.test(input.slug)) throw new ProvisioningError("Slug must be lowercase letters, numbers and dashes (e.g. northstar)");
  if (!EMAIL.test(input.adminEmail.trim())) throw new ProvisioningError("Administrator email is not valid");
  if (!input.adminName.trim()) throw new ProvisioningError("Administrator name is required");
  if (input.password.length < 8) throw new ProvisioningError("Password must be at least 8 characters");
}

/** Default roles (Administrator always gets every permission; other roles keep tenant edits). */
export async function ensureDefaultRoles(db: PrismaClient, organizationId: string): Promise<Map<string, string>> {
  const roles = new Map<string, string>();
  for (const role of DEFAULT_ROLES) {
    const isAdmin = role.key === SYSTEM_ROLE_KEYS.ADMINISTRATOR;
    const row = await db.role.upsert({
      where: { organizationId_key: { organizationId, key: role.key } },
      create: { organizationId, key: role.key, name: role.name, description: role.description, permissions: role.permissions, isSystem: true },
      update: isAdmin ? { permissions: ALL_PERMISSIONS, isSystem: true } : { isSystem: true },
    });
    roles.set(role.key, row.id);
  }
  return roles;
}

/** Seeds each catalogue list with its defaults (existing labels are left alone). */
export async function ensureDefaultLookups(db: PrismaClient, organizationId: string): Promise<void> {
  for (const list of Object.values(LOOKUP_LISTS)) {
    const defaults: readonly { label: string; code?: string; notes?: string; color?: string }[] = list.defaults;
    if (!defaults.length) continue;
    await db.lookupValue.createMany({
      data: defaults.map((value, index) => ({
        organizationId,
        listKey: list.key,
        label: value.label,
        code: value.code ?? null,
        notes: value.notes ?? null,
        color: value.color ?? null,
        sortOrder: index,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
  }
}

/** Stores the registry defaults for every setting key that has no row yet. */
export async function ensureDefaultSettings(db: PrismaClient, organizationId: string): Promise<void> {
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    const value = JSON.parse(JSON.stringify(SETTINGS[key].defaults)) as Prisma.InputJsonValue;
    await db.orgSetting.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { organizationId, key, value },
      update: {},
    });
  }
}

/** Directory fields that may be set when provisioning a user. */
export type ProvisionedUserFields = Partial<
  Pick<Prisma.UserUncheckedCreateInput, "jobTitle" | "employeeNumber" | "phone" | "businessUnitId" | "siteId" | "locationId" | "departmentId" | "managerId" | "isActive">
>;

/** Creates (or reuses) a user with an email/password credential account for Better Auth. */
export async function ensureUserWithPassword(
  db: PrismaClient,
  organizationId: string,
  user: { email: string; name: string; password: string } & ProvisionedUserFields,
  passwordHash?: string,
): Promise<string> {
  const { password, email: rawEmail, name, ...rest } = user;
  const email = rawEmail.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true, organizationId: true } });
  if (existing && existing.organizationId !== organizationId) {
    throw new ProvisioningError(`${email} already belongs to another organisation`);
  }
  const row = existing
    ? await db.user.update({ where: { id: existing.id }, data: { name, ...rest, organizationId } })
    : await db.user.create({ data: { ...rest, organizationId, email, name, emailVerified: true } });
  const account = await db.account.findFirst({ where: { userId: row.id, providerId: "credential" }, select: { id: true } });
  if (!account) {
    await db.account.create({
      data: { userId: row.id, accountId: row.id, providerId: "credential", password: passwordHash ?? (await hashPassword(password)) },
    });
  }
  return row.id;
}

/** Scoped role assignment (idempotent on user + role + scope). */
export async function ensureAssignment(
  db: PrismaClient,
  organizationId: string,
  input: { userId: string; roleId: string; scopeType?: "COMPANY" | "BUSINESS_UNIT" | "SITE" | "LOCATION" | "DEPARTMENT"; scopeId?: string | null; isProtected?: boolean },
): Promise<void> {
  const scopeType = input.scopeType ?? "COMPANY";
  const scopeId = scopeType === "COMPANY" ? null : (input.scopeId ?? null);
  if (scopeType !== "COMPANY" && !scopeId) throw new ProvisioningError(`A ${scopeType} assignment needs a scope id`);
  const scopeKey = scopeType === "COMPANY" ? "COMPANY" : `${scopeType}:${scopeId}`;
  await db.roleAssignment.upsert({
    where: { userId_roleId_scopeKey: { userId: input.userId, roleId: input.roleId, scopeKey } },
    create: { organizationId, userId: input.userId, roleId: input.roleId, scopeType, scopeId, scopeKey, isProtected: Boolean(input.isProtected) },
    update: input.isProtected ? { isProtected: true } : {},
  });
}

export async function provisionTenant(db: PrismaClient, input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  validate(input);
  const enabledModules = normaliseModules(input.modules);
  const existing = await db.organization.findUnique({ where: { slug: input.slug } });
  if (existing && input.failIfExists) throw new ProvisioningError(`An organisation with slug "${input.slug}" already exists`);

  const branding = (input.branding ?? {}) as Prisma.InputJsonObject;
  const org =
    existing ??
    (await db.organization.create({
      data: {
        name: input.name.trim(),
        slug: input.slug,
        enabledModules,
        timeZone: input.timeZone ?? "Europe/Dublin",
        locale: input.locale ?? "en-IE",
        plan: input.plan ?? "trial",
        branding,
      },
    }));
  if (existing) {
    await db.organization.update({ where: { id: org.id }, data: { name: input.name.trim(), enabledModules } });
  }

  const roles = await ensureDefaultRoles(db, org.id);
  await ensureDefaultLookups(db, org.id);
  await ensureDefaultSettings(db, org.id);
  if (enabledModules.includes("incidents")) await ensureIncidentCatalogue(db, org.id);

  const adminUserId = await ensureUserWithPassword(db, org.id, {
    email: input.adminEmail,
    name: input.adminName.trim(),
    password: input.password,
    jobTitle: "Administrator",
  });
  await ensureAssignment(db, org.id, { userId: adminUserId, roleId: roles.get(SYSTEM_ROLE_KEYS.ADMINISTRATOR)!, isProtected: true });

  return { organizationId: org.id, adminUserId, roles, created: !existing };
}
