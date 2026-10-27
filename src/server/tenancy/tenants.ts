import "server-only";
import { systemPrisma } from "@/server/db/client";
import { runWithTenant } from "./context";

/**
 * Run `fn` once per active tenant, each inside its own tenant context (cron fan-out).
 * Failures are isolated per tenant and reported in the result.
 */
export async function forEachTenant<T>(
  fn: (org: { id: string; name: string; timeZone: string; enabledModules: string[] }) => Promise<T>,
): Promise<Array<{ organizationId: string; result?: T; error?: string }>> {
  const orgs = await systemPrisma.organization.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, timeZone: true, enabledModules: true },
    orderBy: { createdAt: "asc" },
  });
  const results: Array<{ organizationId: string; result?: T; error?: string }> = [];
  for (const org of orgs) {
    try {
      results.push({ organizationId: org.id, result: await runWithTenant(org.id, () => fn(org)) });
    } catch (error) {
      console.error(`[tenants] job failed for ${org.id}`, error);
      results.push({ organizationId: org.id, error: String(error) });
    }
  }
  return results;
}
