import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Ambient tenant context (AsyncLocalStorage).
 *
 * `apiHandler` runs every request inside `runWithTenant(user.organizationId)`; cron jobs and
 * scripts use `forEachTenant()` / `runWithTenant()` explicitly. The tenant-aware Prisma client
 * reads this context to scope every query, and fails closed when it is missing.
 */
export interface TenantContext {
  organizationId: string | null;
  /** Bypass tenant scoping (provisioning, cross-tenant jobs). Use sparingly. */
  system?: boolean;
}

/**
 * Kept on globalThis: the dev bundler can load this module more than once (one instance per
 * route bundle) while the Prisma client is a global singleton. Separate AsyncLocalStorage
 * instances would make the client miss the request's context and fall back to a session
 * lookup – a second connection that deadlocks inside an interactive transaction on
 * single-connection databases (prisma dev / PGlite).
 */
const globalTenancy = globalThis as unknown as {
  __tenantStorage?: AsyncLocalStorage<TenantContext>;
  __tenantResolver?: (() => Promise<string | null>) | null;
};
const storage = (globalTenancy.__tenantStorage ??= new AsyncLocalStorage<TenantContext>());

/** Fallback used by server components that query outside apiHandler (set by current-user.ts). */
export function registerTenantResolver(resolver: () => Promise<string | null>): void {
  globalTenancy.__tenantResolver = resolver;
}

export function runWithTenant<T>(organizationId: string, fn: () => T): T {
  return storage.run({ organizationId }, fn);
}

/** Run without tenant scoping. Only for platform provisioning and cross-tenant fan-out. */
export function runAsSystem<T>(fn: () => T): T {
  return storage.run({ organizationId: null, system: true }, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export class TenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(`No tenant context for ${model}.${operation}. Wrap the call in runWithTenant() or call it from apiHandler.`);
    this.name = "TenantContextError";
  }
}

/** The current tenant id, resolving from the signed-in request when no explicit context exists. */
export async function resolveTenantId(): Promise<string | null> {
  const ctx = storage.getStore();
  if (ctx) return ctx.organizationId;
  const fallbackResolver = globalTenancy.__tenantResolver;
  if (!fallbackResolver) return null;
  try {
    return await fallbackResolver();
  } catch {
    // Outside a request scope (headers() unavailable) – fail closed.
    return null;
  }
}

/** Synchronous accessor for code that is known to run inside runWithTenant(). */
export function requireTenantId(): string {
  const id = storage.getStore()?.organizationId;
  if (!id) throw new TenantContextError("context", "requireTenantId");
  return id;
}
