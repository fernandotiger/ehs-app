import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import type { ScopeTypeKey } from "../../src/lib/scope";
import { ensureAssignment, ensureUserWithPassword } from "../../src/server/tenancy/provisioning";

/** Development-only password for every demo account. */
export const DEMO_PASSWORD = "Password123!";

let cachedHash: Promise<string> | null = null;
/** One scrypt hash shared by all demo users (hashing per user would make seeding slow). */
export function demoPasswordHash(): Promise<string> {
  cachedHash ??= hashPassword(DEMO_PASSWORD);
  return cachedHash;
}

// ── Tenant structure ────────────────────────────────────────────────────────

export interface TenantSeed {
  organizationId: string;
  name: string;
  roles: Map<string, string>;
  businessUnits: Map<string, string>;
  sites: Map<string, string>;
  locations: Map<string, string>;
  departments: Map<string, string>;
  /** email → id */
  users: Map<string, string>;
}

export interface StructureSpec {
  businessUnits: { name: string; code?: string }[];
  sites: { name: string; businessUnit: string; code?: string; address?: string }[];
  locations: { name: string; site: string; code?: string }[];
  departments: { name: string; location: string; code?: string }[];
}

/** Idempotent: upserts every node by its per-tenant unique name (ancestors denormalised). */
export async function seedStructure(db: PrismaClient, tenant: TenantSeed, spec: StructureSpec): Promise<void> {
  const organizationId = tenant.organizationId;
  for (const bu of spec.businessUnits) {
    const row = await db.businessUnit.upsert({
      where: { organizationId_name: { organizationId, name: bu.name } },
      create: { organizationId, name: bu.name, code: bu.code ?? null },
      update: {},
    });
    tenant.businessUnits.set(bu.name, row.id);
  }
  const siteBu = new Map<string, string>();
  for (const site of spec.sites) {
    const businessUnitId = tenant.businessUnits.get(site.businessUnit)!;
    const row = await db.site.upsert({
      where: { organizationId_businessUnitId_name: { organizationId, businessUnitId, name: site.name } },
      create: { organizationId, businessUnitId, name: site.name, code: site.code ?? null, address: site.address ?? null },
      update: {},
    });
    tenant.sites.set(site.name, row.id);
    siteBu.set(row.id, businessUnitId);
  }
  const locationParents = new Map<string, { siteId: string; businessUnitId: string }>();
  for (const location of spec.locations) {
    const siteId = tenant.sites.get(location.site)!;
    const businessUnitId = siteBu.get(siteId)!;
    const row = await db.location.upsert({
      where: { organizationId_siteId_name: { organizationId, siteId, name: location.name } },
      create: { organizationId, businessUnitId, siteId, name: location.name, code: location.code ?? null },
      update: {},
    });
    tenant.locations.set(location.name, row.id);
    locationParents.set(row.id, { siteId, businessUnitId });
  }
  for (const department of spec.departments) {
    const locationId = tenant.locations.get(department.location)!;
    const parents = locationParents.get(locationId)!;
    const row = await db.department.upsert({
      where: { organizationId_locationId_name: { organizationId, locationId, name: department.name } },
      create: { organizationId, ...parents, locationId, name: department.name, code: department.code ?? null },
      update: {},
    });
    tenant.departments.set(department.name, row.id);
  }
}

/** Home placement from the most specific node (department, else location, else site). */
export async function placementFor(db: PrismaClient, tenant: TenantSeed, at: { department?: string; location?: string; site?: string }) {
  if (at.department) {
    const d = await db.department.findUniqueOrThrow({ where: { id: tenant.departments.get(at.department)! } });
    return { businessUnitId: d.businessUnitId, siteId: d.siteId, locationId: d.locationId, departmentId: d.id };
  }
  if (at.location) {
    const l = await db.location.findUniqueOrThrow({ where: { id: tenant.locations.get(at.location)! } });
    return { businessUnitId: l.businessUnitId, siteId: l.siteId, locationId: l.id, departmentId: null };
  }
  if (at.site) {
    const s = await db.site.findUniqueOrThrow({ where: { id: tenant.sites.get(at.site)! } });
    return { businessUnitId: s.businessUnitId, siteId: s.id, locationId: null, departmentId: null };
  }
  return { businessUnitId: null, siteId: null, locationId: null, departmentId: null };
}

export interface UserSpec {
  email: string;
  name: string;
  jobTitle: string;
  employeeNumber: string;
  at: { department?: string; location?: string; site?: string };
  /** Role key + optional scope (default COMPANY). */
  roles: { role: string; scope?: Exclude<ScopeTypeKey, "COMPANY">; at?: string }[];
  manager?: string;
}

/** Idempotent: user + credential account + placement + scoped role assignments + manager. */
export async function seedUsers(db: PrismaClient, tenant: TenantSeed, users: UserSpec[]): Promise<void> {
  const hash = await demoPasswordHash();
  for (const u of users) {
    const placement = await placementFor(db, tenant, u.at);
    const id = await ensureUserWithPassword(
      db,
      tenant.organizationId,
      { email: u.email, name: u.name, password: DEMO_PASSWORD, jobTitle: u.jobTitle, employeeNumber: u.employeeNumber, ...placement },
      hash,
    );
    tenant.users.set(u.email, id);
    for (const r of u.roles) {
      const scopeId = r.scope ? scopeNodeId(tenant, r.scope, r.at!) : null;
      await ensureAssignment(db, tenant.organizationId, { userId: id, roleId: tenant.roles.get(r.role)!, scopeType: r.scope ?? "COMPANY", scopeId });
    }
  }
  for (const u of users) {
    if (u.manager) await db.user.update({ where: { id: tenant.users.get(u.email)! }, data: { managerId: tenant.users.get(u.manager) ?? null } });
  }
}

function scopeNodeId(tenant: TenantSeed, scope: Exclude<ScopeTypeKey, "COMPANY">, name: string): string {
  const map = { BUSINESS_UNIT: tenant.businessUnits, SITE: tenant.sites, LOCATION: tenant.locations, DEPARTMENT: tenant.departments }[scope];
  const id = map.get(name);
  if (!id) throw new Error(`Unknown ${scope} "${name}"`);
  return id;
}

// ── Signing (mirrors src/server/audit/signing.ts, which is server-only) ─────

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sign(record: Record<string, unknown>): string {
  const secret = process.env.AUDIT_SIGNING_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET (or AUDIT_SIGNING_SECRET) is required to sign seeded records");
  return createHmac("sha256", secret).update(canonicalJson(record)).digest("hex");
}

/** Same payload shape as recordAudit() (including organizationId) so seeded audit rows verify. */
export function auditRow(
  organizationId: string,
  entry: {
    entityType: string;
    entityId: string;
    action: string;
    actor: { id: string; name: string } | null;
    changes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  },
): Prisma.AuditLogCreateManyInput {
  const changes = entry.changes ? (JSON.parse(JSON.stringify(entry.changes)) as Prisma.InputJsonObject) : null;
  const metadata = entry.metadata ? (JSON.parse(JSON.stringify(entry.metadata)) as Prisma.InputJsonObject) : null;
  const payload = {
    organizationId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorId: entry.actor?.id ?? null,
    actorName: entry.actor?.name ?? null,
    changes,
    metadata,
    createdAt: entry.createdAt.toISOString(),
  };
  return {
    ...payload,
    changes: changes ?? undefined,
    metadata: metadata ?? undefined,
    createdAt: entry.createdAt,
    userAgent: "seed",
    signature: sign(payload),
  };
}

// ── Storage (mirrors the StorageProvider strategies) ────────────────────────

export async function storeFile(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    const root = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? "./storage");
    const target = path.resolve(root, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  } else if (driver === "vercel-blob") {
    const { put } = await import("@vercel/blob");
    await put(key, Buffer.from(bytes), {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } else {
    console.warn(`  ! STORAGE_DRIVER=${driver} is not supported by the seed – ${key} was not written (downloads will 404).`);
  }
  return driver;
}
