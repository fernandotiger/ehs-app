import "server-only";
import type { Permission } from "@/lib/permissions";
import { hasCompanyScope } from "@/server/auth/authorization";
import type { CurrentUser } from "@/server/auth/current-user";
import { isStructureLevel, type StructureLevel } from "@/lib/validation/configuration";
import { ForbiddenError, NotFoundError } from "@/server/http/errors";

/**
 * Configuration acts on the whole company, so its permissions only count when held at
 * Whole-company scope. (A site-scoped "Manage roles" grant must not let someone hand out
 * company-wide administrator access.) apiHandler has already checked the permission exists.
 */
export function requireCompanyConfig(user: Pick<CurrentUser, "grants" | "permissions">, permission: Permission): void {
  if (!hasCompanyScope(user, permission)) {
    throw new ForbiddenError("Configuration permissions apply only when assigned for the whole company.");
  }
}

/** Trim + collapse inner whitespace (names are compared case-insensitively). */
export function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Route param → structure level (unknown levels 404). */
export function levelOf(params: Record<string, string>): StructureLevel {
  const level = params.level ?? "";
  if (!isStructureLevel(level)) throw new NotFoundError();
  return level;
}
