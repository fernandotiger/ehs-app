/**
 * Pure tenant-scoping rules used by the tenant-aware Prisma client (src/server/db/client.ts).
 * Kept free of I/O and `server-only` so it can be unit-tested.
 */

export const TENANT_FIELD = "organizationId";

/** Operations whose `where` gets `organizationId = <tenant>` added. */
export const WHERE_OPERATIONS: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

export const CREATE_OPERATIONS: ReadonlySet<string> = new Set(["create", "createMany", "createManyAndReturn"]);

export type ScopedArgs = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown; create?: unknown };

export class CrossTenantWriteError extends Error {
  constructor(model: string) {
    super(`Cross-tenant write rejected on ${model}`);
    this.name = "CrossTenantWriteError";
  }
}

function checkData(data: unknown, organizationId: string, model: string): void {
  for (const row of Array.isArray(data) ? data : [data]) {
    if (!row || typeof row !== "object") continue;
    const value = (row as Record<string, unknown>)[TENANT_FIELD];
    if (value === undefined) (row as Record<string, unknown>)[TENANT_FIELD] = organizationId;
    else if (value !== organizationId) throw new CrossTenantWriteError(model);
  }
}

/**
 * Adds `organizationId = <current tenant>` to every read/update/delete on tenant models and
 * verifies creates belong to the current tenant (a missing value is filled in, a different one
 * throws). Nested writes are not rewritten: pass organizationId explicitly (the types require it).
 */
export function scopeArgs(model: string, operation: string, args: ScopedArgs | undefined, organizationId: string): ScopedArgs {
  const next: ScopedArgs = { ...(args ?? {}) };
  if (WHERE_OPERATIONS.has(operation)) {
    next.where = { ...(next.where ?? {}), [TENANT_FIELD]: organizationId };
  } else if (CREATE_OPERATIONS.has(operation)) {
    checkData(next.data, organizationId, model);
  } else if (operation === "upsert") {
    next.where = { ...(next.where ?? {}), [TENANT_FIELD]: organizationId };
    checkData(next.create, organizationId, model);
  }
  return next;
}
