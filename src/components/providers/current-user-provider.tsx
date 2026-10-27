"use client";

import { createContext, useContext, useMemo } from "react";
import type { ModuleKey } from "@/lib/modules";
import type { Permission } from "@/lib/permissions";
import { grantsCover, type PermissionGrants, type Placement } from "@/lib/scope";

/** Client-side view of the signed-in user (mirrors server CurrentUser). */
export interface SessionUser {
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
  /** Union of permissions held in any scope (menus, coarse checks). */
  permissions: Permission[];
  /** Permission → scopes (record-level checks via canAt). */
  grants: PermissionGrants;
}

interface CurrentUserContextValue {
  user: SessionUser;
  /** Holds the permission somewhere. UI convenience only – the API always re-checks. */
  can: (permission: Permission) => boolean;
  canAny: (permissions: readonly Permission[]) => boolean;
  /** Holds the permission in a scope covering this placement (e.g. a record's site/department). */
  canAt: (permission: Permission, placement: Placement) => boolean;
  /** The tenant has the module switched on. */
  hasModule: (module: ModuleKey) => boolean;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function CurrentUserProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const value = useMemo<CurrentUserContextValue>(
    () => ({
      user,
      can: (p) => user.permissions.includes(p),
      canAny: (ps) => ps.some((p) => user.permissions.includes(p)),
      canAt: (p, placement) => grantsCover(user.grants, p, placement),
      hasModule: (m) => user.enabledModules.includes(m),
    }),
    [user],
  );
  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used inside CurrentUserProvider");
  return ctx;
}
