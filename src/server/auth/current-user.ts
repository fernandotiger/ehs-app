import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { isModuleKey, type ModuleKey } from "@/lib/modules";
import { isPermission, type Permission } from "@/lib/permissions";
import type { PermissionGrants, ScopeRef } from "@/lib/scope";
import { auth } from "@/server/auth/auth";
import { systemPrisma } from "@/server/db/client";
import { registerTenantResolver } from "@/server/tenancy/context";

/**
 * The authenticated principal as seen by the domain layer.
 * Loaded once per request (React `cache`) with the tenant, scoped role assignments and
 * effective permissions.
 */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  timeZone: string;
  enabledModules: ModuleKey[];
  businessUnitId: string | null;
  siteId: string | null;
  siteName: string | null;
  locationId: string | null;
  locationName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  roleIds: string[];
  roleKeys: string[];
  roleNames: string[];
  /** Union of permissions held anywhere (use for menus and coarse checks). */
  permissions: Permission[];
  /** Permission → scopes (use for record-level checks: canAt / scopeWhere). */
  grants: PermissionGrants;
}

export async function loadUserPrincipal(userId: string): Promise<CurrentUser | null> {
  // Runs before a tenant context exists, so it uses the unscoped client.
  const user = await systemPrisma.user.findUnique({
    where: { id: userId },
    include: {
      site: { select: { name: true } },
      location: { select: { name: true } },
      department: { select: { name: true } },
      roleAssignments: { include: { role: { select: { id: true, key: true, name: true, permissions: true } } } },
    },
  });
  if (!user || !user.isActive) return null;

  const org = await systemPrisma.organization.findUnique({ where: { id: user.organizationId } });
  if (!org || org.status !== "ACTIVE") return null;

  const grants: PermissionGrants = {};
  const roles = new Map<string, { key: string; name: string }>();
  for (const assignment of user.roleAssignments) {
    const { role } = assignment;
    roles.set(role.id, { key: role.key, name: role.name });
    const scope: ScopeRef = { type: assignment.scopeType, id: assignment.scopeId };
    for (const p of role.permissions) {
      if (!isPermission(p)) continue;
      const list = (grants[p] ??= []);
      if (!list.some((s) => s.type === scope.type && s.id === scope.id)) list.push(scope);
    }
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    jobTitle: user.jobTitle,
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    timeZone: org.timeZone,
    enabledModules: org.enabledModules.filter(isModuleKey),
    businessUnitId: user.businessUnitId,
    siteId: user.siteId,
    siteName: user.site?.name ?? null,
    locationId: user.locationId,
    locationName: user.location?.name ?? null,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
    managerId: user.managerId,
    roleIds: [...roles.keys()],
    roleKeys: [...roles.values()].map((r) => r.key),
    roleNames: [...roles.values()].map((r) => r.name),
    permissions: Object.keys(grants) as Permission[],
    grants,
  };
}

/** Returns the signed-in user for the current request, or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return loadUserPrincipal(session.user.id);
});

// Server components that query outside apiHandler are scoped to the signed-in user's tenant.
registerTenantResolver(async () => (await getCurrentUser())?.organizationId ?? null);
