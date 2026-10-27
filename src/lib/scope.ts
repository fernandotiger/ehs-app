/**
 * Scoped access – pure helpers shared by client and server.
 *
 * A role assignment grants its permissions within a scope of the company structure
 * (Business unit → Site → Location → Department). A record is "placed" in that structure
 * by storing all four ids (most-specific chosen by the user, ancestors filled in by
 * resolvePlacement()). A scope covers a record when the record's id at that level matches.
 */
import type { Permission } from "./permissions";

export const SCOPE_TYPES = ["COMPANY", "BUSINESS_UNIT", "SITE", "LOCATION", "DEPARTMENT"] as const;
export type ScopeTypeKey = (typeof SCOPE_TYPES)[number];

export const SCOPE_LABELS: Record<ScopeTypeKey, string> = {
  COMPANY: "Whole company",
  BUSINESS_UNIT: "Business unit",
  SITE: "Site",
  LOCATION: "Location",
  DEPARTMENT: "Department",
};

export interface ScopeRef {
  type: ScopeTypeKey;
  /** null for COMPANY */
  id: string | null;
}

/** Where a record sits in the company structure. */
export interface Placement {
  businessUnitId?: string | null;
  siteId?: string | null;
  locationId?: string | null;
  departmentId?: string | null;
}

export type PlacementField = keyof Placement;

export const SCOPE_FIELD: Record<Exclude<ScopeTypeKey, "COMPANY">, PlacementField> = {
  BUSINESS_UNIT: "businessUnitId",
  SITE: "siteId",
  LOCATION: "locationId",
  DEPARTMENT: "departmentId",
};

/** Permission → scopes in which the user holds it. */
export type PermissionGrants = Partial<Record<Permission, ScopeRef[]>>;

export function scopeKey(scope: ScopeRef): string {
  return scope.type === "COMPANY" ? "COMPANY" : `${scope.type}:${scope.id}`;
}

export function scopeCovers(scope: ScopeRef, placement: Placement): boolean {
  if (scope.type === "COMPANY") return true;
  const value = placement[SCOPE_FIELD[scope.type]];
  return Boolean(value) && value === scope.id;
}

/** True when any of the user's scopes for `permission` covers the placement. */
export function grantsCover(grants: PermissionGrants, permission: Permission, placement: Placement): boolean {
  return (grants[permission] ?? []).some((s) => scopeCovers(s, placement));
}

export function hasCompanyWide(grants: PermissionGrants, permission: Permission): boolean {
  return (grants[permission] ?? []).some((s) => s.type === "COMPANY");
}
