import "server-only";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { MODULE_RECORD_COUNTERS } from "./module-counts";

/**
 * Home → Insights (at most four groups): directory users & role coverage, users by role
 * (a person with several roles counts once in each), company structure counts and per-module
 * record counts. Directory membership is not a count of signed-in sessions.
 *
 * Counts are aggregated in two SQL statements (raw SQL is not tenant-scoped by the client, so
 * every statement filters on the caller's organizationId explicitly).
 */
export interface InsightsDto {
  directory: { active: number; inactive: number; canSignIn: number; directoryOnly: number; withRole: number; withoutRole: number };
  usersByRole: { roleId: string; name: string; users: number }[];
  structure: { businessUnits: number; sites: number; locations: number; departments: number };
  modules: { module: string; label: string; hint: string; href: string; count: number }[];
}

interface CountsRow {
  active: number;
  inactive: number;
  can_sign_in: number;
  with_role: number;
  business_units: number;
  sites: number;
  locations: number;
  departments: number;
}

export const insightsService = {
  async get(user: CurrentUser): Promise<InsightsDto> {
    const org = user.organizationId;
    const [counts] = await prisma.$queryRaw<CountsRow[]>`
      SELECT
        (SELECT count(*)::int FROM users u WHERE u."organizationId" = ${org} AND u."isActive") AS active,
        (SELECT count(*)::int FROM users u WHERE u."organizationId" = ${org} AND NOT u."isActive") AS inactive,
        (SELECT count(*)::int FROM users u WHERE u."organizationId" = ${org} AND u."isActive"
           AND EXISTS (SELECT 1 FROM accounts a WHERE a."userId" = u.id AND a."providerId" = 'credential')) AS can_sign_in,
        (SELECT count(*)::int FROM users u WHERE u."organizationId" = ${org} AND u."isActive"
           AND EXISTS (SELECT 1 FROM role_assignments ra WHERE ra."userId" = u.id)) AS with_role,
        (SELECT count(*)::int FROM business_units WHERE "organizationId" = ${org} AND "isActive") AS business_units,
        (SELECT count(*)::int FROM sites WHERE "organizationId" = ${org} AND "isActive") AS sites,
        (SELECT count(*)::int FROM locations WHERE "organizationId" = ${org} AND "isActive") AS locations,
        (SELECT count(*)::int FROM departments WHERE "organizationId" = ${org} AND "isActive") AS departments`;
    const byRole = await prisma.$queryRaw<{ role_id: string; name: string; users: number }[]>`
      SELECT r.id AS role_id, r.name, count(DISTINCT u.id)::int AS users
        FROM roles r
        LEFT JOIN role_assignments ra ON ra."roleId" = r.id
        LEFT JOIN users u ON u.id = ra."userId" AND u."isActive"
       WHERE r."organizationId" = ${org}
       GROUP BY r.id, r.name`;
    const modules = [];
    for (const counter of MODULE_RECORD_COUNTERS.filter((c) => user.enabledModules.includes(c.module))) {
      modules.push({ module: counter.module, label: counter.label, hint: counter.hint, href: counter.href, count: await counter.count() });
    }
    const c = counts!;
    return {
      directory: {
        active: c.active,
        inactive: c.inactive,
        canSignIn: c.can_sign_in,
        directoryOnly: c.active - c.can_sign_in,
        withRole: c.with_role,
        withoutRole: c.active - c.with_role,
      },
      usersByRole: byRole
        .map((r) => ({ roleId: r.role_id, name: r.name, users: r.users }))
        .sort((a, b) => b.users - a.users || a.name.localeCompare(b.name)),
      structure: { businessUnits: c.business_units, sites: c.sites, locations: c.locations, departments: c.departments },
      modules,
    };
  },
};
