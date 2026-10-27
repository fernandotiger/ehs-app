import type { ModuleKey } from "@/lib/modules";
import type { Permission } from "@/lib/permissions";
import { grantsCover, hasCompanyWide, SCOPE_FIELD, type Placement } from "@/lib/scope";
import { ForbiddenError, NotFoundError } from "@/server/http/errors";
import type { CurrentUser } from "./current-user";

type Principal = Pick<CurrentUser, "permissions" | "grants">;

/** Holds the permission in at least one scope (menus, coarse endpoint gates). */
export function hasPermission(user: Pick<CurrentUser, "permissions">, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

export function hasAnyPermission(user: Pick<CurrentUser, "permissions">, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => user.permissions.includes(p));
}

export function requirePermission(user: Pick<CurrentUser, "permissions">, permission: Permission): void {
  if (!hasPermission(user, permission)) throw new ForbiddenError();
}

export function requireAnyPermission(user: Pick<CurrentUser, "permissions">, permissions: readonly Permission[]): void {
  if (!hasAnyPermission(user, permissions)) throw new ForbiddenError();
}

/** Holds the permission for the whole company. */
export function hasCompanyScope(user: Principal, permission: Permission): boolean {
  return hasCompanyWide(user.grants, permission);
}

/** Holds the permission in a scope covering this record's placement. */
export function canAt(user: Principal, permission: Permission, placement: Placement): boolean {
  return grantsCover(user.grants, permission, placement);
}

/** Like canAt but throws. Pass `asNotFound` for reads so existence is not leaked. */
export function requireAt(user: Principal, permission: Permission, placement: Placement, asNotFound = false): void {
  if (canAt(user, permission, placement)) return;
  throw asNotFound ? new NotFoundError() : new ForbiddenError();
}

/**
 * Specification → Prisma `where` fragment for records the user may access with `permission`
 * (any of several permissions when an array is given). Returns:
 *   {}    – company-wide access (no restriction)
 *   {OR}  – restricted to the placement ids of the user's scopes
 *   null  – no access at all (callers usually fall back to "own records only")
 * The target model must have the placement columns businessUnitId/siteId/locationId/departmentId.
 */
export function scopeWhere(user: Principal, permission: Permission | readonly Permission[]): Record<string, unknown> | null {
  const keys: readonly Permission[] = typeof permission === "string" ? [permission] : permission;
  const ids: Record<string, Set<string>> = {};
  let any = false;
  for (const key of keys) {
    for (const scope of user.grants[key] ?? []) {
      any = true;
      if (scope.type === "COMPANY") return {};
      if (!scope.id) continue;
      (ids[SCOPE_FIELD[scope.type]] ??= new Set()).add(scope.id);
    }
  }
  if (!any) return null;
  return { OR: Object.entries(ids).map(([field, set]) => ({ [field]: { in: [...set] } })) };
}

/** Module enabled for the user's tenant (subscription). */
export function moduleEnabled(user: Pick<CurrentUser, "enabledModules">, module: ModuleKey): boolean {
  return user.enabledModules.includes(module);
}
