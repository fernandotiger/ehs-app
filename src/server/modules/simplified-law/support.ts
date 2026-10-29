import "server-only";
import type { DbClient } from "@/server/db/client";
import { BusinessRuleError, ValidationError } from "@/server/http/errors";
import { localDate } from "@/server/modules/jobs/engine";

/** Shared helpers for the Simplified law services (audit actions, dates, names). */

export {
  SLAW_CATEGORY_ENTITY,
  SLAW_LEGISLATION_ENTITY,
  SLAW_REQUIREMENT_ENTITY,
  SLAW_SETTINGS_ENTITY,
  slawActionHref,
  slawLegislationHref,
} from "@/lib/simplified-law";

export const SLAW_AUDIT = {
  APPLICABILITY_SAVED: "SLAW_APPLICABILITY_SAVED",
  REQUIREMENT_ASSESSED: "SLAW_REQUIREMENT_ASSESSED",
  ACTION_COMPLETED: "SLAW_ACTION_COMPLETED",
  ACTION_CLOSED: "SLAW_ACTION_CLOSED",
  LEGISLATION_CREATED: "SLAW_LEGISLATION_CREATED",
  LEGISLATION_UPDATED: "SLAW_LEGISLATION_UPDATED",
  LEGISLATION_ARCHIVED: "SLAW_LEGISLATION_ARCHIVED",
  LEGISLATION_RESTORED: "SLAW_LEGISLATION_RESTORED",
  CONTENT_CHANGED: "SLAW_CONTENT_CHANGED",
  CATEGORY_CREATED: "SLAW_CATEGORY_CREATED",
  CATEGORY_UPDATED: "SLAW_CATEGORY_UPDATED",
  CATEGORY_ARCHIVED: "SLAW_CATEGORY_ARCHIVED",
  CATEGORY_RESTORED: "SLAW_CATEGORY_RESTORED",
  SETTINGS_UPDATED: "SLAW_SETTINGS_UPDATED",
} as const;

export function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** "yyyy-mm-dd" → Date at UTC midnight for @db.Date columns. */
export function toDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function todayFor(timeZone: string, now = new Date()): string {
  return localDate(now, timeZone);
}

/** Throws the 422 business-rule error the UI renders as a list of what is missing. */
export function blocked(message: string, blockers: string[]): never {
  throw new BusinessRuleError(`${message}: ${blockers.join(" ")}`, { blockers });
}

/** Active directory users only (new choices); ids from another tenant are simply not found. */
export async function assertActiveUser(db: DbClient, id: string, what: string): Promise<void> {
  const found = await db.user.count({ where: { id, isActive: true } });
  if (!found) throw new ValidationError(`Choose an active person from the directory for ${what}.`);
}

/** id → name for the given users (deactivated people keep their name). */
export async function userNames(db: DbClient, ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const rows = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(rows.map((u) => [u.id, u.name]));
}

export const named = (names: Map<string, string>, id: string | null | undefined) => (id ? { id, name: names.get(id) ?? "Unknown" } : null);
