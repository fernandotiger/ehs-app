import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/config/env";
import { getTenantContext, resolveTenantId, TenantContextError } from "@/server/tenancy/context";
import { scopeArgs, TENANT_FIELD, type ScopedArgs } from "./tenant-scope";

/**
 * Prisma client factory.
 *
 * Prisma 7 talks to the database through a driver adapter. The adapter is chosen by
 * DATABASE_DRIVER so the same code base runs on:
 *   - "neon" → Neon serverless driver (ideal for Vercel functions)
 *   - "pg"   → node-postgres (local Postgres, AWS RDS / Aurora, any standard Postgres)
 */
function createPrismaClient(): PrismaClient {
  const { DATABASE_DRIVER, DATABASE_URL, DATABASE_POOL_MAX, DATABASE_IDLE_TIMEOUT_MS, NODE_ENV } = env();
  const log: ("error" | "warn")[] = NODE_ENV === "development" ? ["error", "warn"] : ["error"];

  const pool = {
    connectionString: DATABASE_URL,
    ...(DATABASE_POOL_MAX ? { max: DATABASE_POOL_MAX } : {}),
    ...(DATABASE_IDLE_TIMEOUT_MS ? { idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS } : {}),
  };
  const adapter = DATABASE_DRIVER === "neon" ? new PrismaNeon(pool) : new PrismaPg(pool);

  return new PrismaClient({ adapter, log });
}

// ─── Tenant scoping ──────────────────────────────────────────────────────────

/** Every model with an `organizationId` column is tenant-scoped (derived, no list to maintain). */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.values(Prisma.ModelName).filter((name) => {
    const fields = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[`${name}ScalarFieldEnum`];
    return Boolean(fields && TENANT_FIELD in fields);
  }),
);

// The scoping rules themselves (pure, unit-tested) live in ./tenant-scope.ts.

const tenantScope = Prisma.defineExtension({
  name: "tenant-scope",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args);
        const ctx = getTenantContext();
        if (ctx?.system) return query(args);
        const organizationId = await resolveTenantId();
        if (!organizationId) throw new TenantContextError(model, operation);
        return query(scopeArgs(model, operation, args as ScopedArgs, organizationId));
      },
    },
  },
});

// Re-use clients across hot reloads in development and warm serverless invocations.
const globalForPrisma = globalThis as unknown as { __prismaBase?: PrismaClient; __prisma?: PrismaClient };

/**
 * Unscoped client. ONLY for authentication, principal loading, tenant provisioning and
 * cross-tenant job fan-out. Never use it to serve tenant data to a user.
 */
export const systemPrisma: PrismaClient = globalForPrisma.__prismaBase ?? createPrismaClient();

/**
 * Tenant-scoped client used by all module code. Query extensions do not change the API
 * surface, so it is typed as a plain PrismaClient.
 */
export const prisma: PrismaClient =
  globalForPrisma.__prisma ?? (systemPrisma.$extends(tenantScope) as unknown as PrismaClient);

globalForPrisma.__prismaBase = systemPrisma;
globalForPrisma.__prisma = prisma;

/** Client type usable both inside and outside interactive transactions. */
export type DbClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
