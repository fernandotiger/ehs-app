import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { DbClient } from "@/server/db/client";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { resolveTenantId, TenantContextError } from "@/server/tenancy/context";
import { signRecord } from "./signing";

export interface AuditActor {
  id: string;
  name: string;
}

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  actor: AuditActor | null;
  /** Field-level changes: { field: { from, to } } or any JSON payload. */
  changes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  meta?: RequestMeta;
}

/**
 * Append-only audit log. Call inside the same transaction as the mutation it describes
 * (pass the transaction client) so the change and its audit record commit atomically.
 */
export async function recordAudit(entry: AuditEntry, db: DbClient = prisma): Promise<void> {
  const organizationId = await resolveTenantId();
  if (!organizationId) throw new TenantContextError("AuditLog", "create");
  const createdAt = new Date();
  const payload = {
    organizationId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorId: entry.actor?.id ?? null,
    actorName: entry.actor?.name ?? null,
    changes: toJson(entry.changes),
    metadata: toJson(entry.metadata),
    createdAt: createdAt.toISOString(),
  };

  await db.auditLog.create({
    data: {
      organizationId,
      entityType: payload.entityType,
      entityId: payload.entityId,
      action: payload.action,
      actorId: payload.actorId,
      actorName: payload.actorName,
      changes: payload.changes ?? undefined,
      metadata: payload.metadata ?? undefined,
      ipAddress: entry.meta?.ipAddress ?? null,
      userAgent: entry.meta?.userAgent ?? null,
      createdAt,
      signature: signRecord(payload),
    },
  });
}

/** Compute a { field: { from, to } } diff between two flat objects for the given keys. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  keys: (keyof T)[] = Object.keys(after) as (keyof T)[],
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    if (!(key in after)) continue;
    const from = normalise(before[key]);
    const to = normalise(after[key]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key as string] = { from, to };
  }
  return Object.keys(changes).length ? changes : null;
}

function normalise(v: unknown): unknown {
  return v instanceof Date ? v.toISOString() : (v ?? null);
}

function toJson(v: Record<string, unknown> | null | undefined): Prisma.InputJsonObject | null {
  return v ? (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject) : null;
}
