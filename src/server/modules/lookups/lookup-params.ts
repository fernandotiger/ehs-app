import "server-only";
import { isLookupListKey, LOOKUP_LISTS, type LookupListKey } from "@/lib/lookups";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { hasAnyPermission } from "@/server/auth/authorization";
import type { CurrentUser } from "@/server/auth/current-user";
import { ForbiddenError, NotFoundError } from "@/server/http/errors";

/** Route param → catalogue list key (unknown lists 404). */
export function listKeyOf(params: Record<string, string>): LookupListKey {
  const key = params.listKey ?? "";
  if (!isLookupListKey(key)) throw new NotFoundError("Unknown list");
  return key;
}

/** Module configuration permissions that may also maintain that module's lists (e.g. incident causes). */
const MODULE_LIST_PERMISSIONS: Partial<Record<string, Permission>> = {
  incidents: PERMISSIONS.INCIDENT_CONFIGURE,
  risk: PERMISSIONS.RISK_CONFIGURE,
};

/** Who may change a list's values: list managers, or the owning module's configurators. */
export function listManagePermissions(listKey: LookupListKey): Permission[] {
  const list = LOOKUP_LISTS[listKey] as { module?: string };
  const extra = list.module ? MODULE_LIST_PERMISSIONS[list.module] : undefined;
  return extra ? [PERMISSIONS.CONFIG_LISTS, extra] : [PERMISSIONS.CONFIG_LISTS];
}

export function requireListManager(user: Pick<CurrentUser, "permissions">, listKey: LookupListKey): LookupListKey {
  if (!hasAnyPermission(user, listManagePermissions(listKey))) throw new ForbiddenError();
  return listKey;
}
