import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { fieldsForSite, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import { parseStoredFormSchema } from "@/lib/forms/definition-schema";
import { asContent, LAW_FORM_MODULE, LAW_FORM_PURPOSE, versionRank, type LawContent } from "@/lib/law";
import type { DbClient } from "@/server/db/client";
import { BusinessRuleError, ValidationError } from "@/server/http/errors";

/** Shared helpers for the Law services (entity names, links, dates, content versions, captured form). */

export { dateOnly, iso, loadNames, toDate, todayFor, type NamedRef, type NameMaps } from "@/server/modules/incidents/support";

export const PROFILE_ENTITY = "LawProfile";
export const REQUIREMENT_ENTITY = "LawRequirement";
export const TASK_ENTITY = "LawTask";
export const CONTENT_ENTITY = "LawContentVersion";

export const profileHref = (id: string) => `/law/profiles/${id}`;
export const requirementHref = (id: string) => `/law/requirements/${id}`;
export const taskHref = (id: string) => `/law/tasks/${id}`;

export const LAW_AUDIT = {
  CONTENT_INSTALLED: "LAW_CONTENT_INSTALLED",
  PROFILE_CREATED: "LAW_PROFILE_CREATED",
  PROFILE_UPDATED: "LAW_PROFILE_UPDATED",
  PROFILE_ARCHIVED: "LAW_PROFILE_ARCHIVED",
  PROFILE_RESTORED: "LAW_PROFILE_RESTORED",
  PROFILE_ACCEPTED: "LAW_PROFILE_CONTENT_ACCEPTED",
  REQUIREMENT_ADDED: "LAW_REQUIREMENT_ADDED",
  REQUIREMENT_UPDATED: "LAW_REQUIREMENT_UPDATED",
  REQUIREMENT_ARCHIVED: "LAW_REQUIREMENT_ARCHIVED",
  REQUIREMENT_RESTORED: "LAW_REQUIREMENT_RESTORED",
  CONTENT_CHANGED: "LAW_REQUIREMENT_CONTENT_CHANGED",
  EVALUATION_SAVED: "LAW_EVALUATION_SAVED",
  REVIEW_CONFIRMED: "LAW_REVIEW_CONFIRMED",
  EXCLUDED: "LAW_REQUIREMENT_EXCLUDED",
  INCLUDED: "LAW_REQUIREMENT_INCLUDED",
  LINKED: "LAW_RECORD_LINKED",
  UNLINKED: "LAW_RECORD_UNLINKED",
  INCIDENT_RAISED: "LAW_INCIDENT_RAISED",
  ACTION_RAISED: "LAW_ACTION_RAISED",
  TASK_CREATED: "LAW_TASK_CREATED",
  TASK_UPDATED: "LAW_TASK_UPDATED",
  TASK_COMPLETED: "LAW_TASK_COMPLETED",
  TASK_ARCHIVED: "LAW_TASK_ARCHIVED",
  TASK_RESTORED: "LAW_TASK_RESTORED",
} as const;

export const placementSelect = { businessUnitId: true, siteId: true, locationId: true, departmentId: true } as const;

export function placementOf(r: { businessUnitId: string | null; siteId: string | null; locationId: string | null; departmentId: string | null }) {
  return { businessUnitId: r.businessUnitId, siteId: r.siteId, locationId: r.locationId, departmentId: r.departmentId };
}

export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

/** A department of the profile's site (tasks, evaluations and follow-ups stay on that site). */
export async function assertDepartmentAtSite(db: DbClient, departmentId: string, siteId: string | null): Promise<void> {
  const dept = await db.department.findUnique({ where: { id: departmentId }, select: { siteId: true, isActive: true } });
  if (!dept || !dept.isActive) throw new ValidationError("Choose an active department.");
  if (siteId && dept.siteId !== siteId) throw new ValidationError("Choose a department in this profile's site.");
}

// ── Content versions ────────────────────────────────────────────────────────

export interface ContentVersionRow {
  id: string;
  version: string;
  rank: number;
  releasedOn: Date;
  summary: string;
  content: LawContent;
  changes: unknown;
  installedAt: Date;
}

/** Per-request cache of installed versions (the library rarely has more than a handful). */
export async function loadVersions(db: DbClient): Promise<ContentVersionRow[]> {
  const rows = await db.lawContentVersion.findMany({ orderBy: { rank: "asc" } });
  return rows.map((r) => ({ ...r, content: asContent(r.content) }));
}

export function latestVersion(versions: readonly ContentVersionRow[]): ContentVersionRow | null {
  return versions.length ? versions[versions.length - 1]! : null;
}

export function findVersion(versions: readonly ContentVersionRow[], version: string): ContentVersionRow | null {
  return versions.find((v) => v.version === version) ?? null;
}

export function isNewer(candidate: string, than: string): boolean {
  return versionRank(candidate) > versionRank(than);
}

// ── Captured Law form (extra evaluation questions) ──────────────────────────

export async function captureLawForm(db: DbClient, versionId: string, siteId: string | null): Promise<QuestionnaireSnapshot> {
  const version = await db.formVersion.findUnique({ where: { id: versionId } });
  if (!version || version.module !== LAW_FORM_MODULE || version.purpose !== LAW_FORM_PURPOSE) throw new ValidationError("Choose a published Law form.");
  const settings = version.settings && typeof version.settings === "object" && !Array.isArray(version.settings) ? (version.settings as Record<string, unknown>) : {};
  return {
    formId: version.formId,
    versionId: version.id,
    version: version.version,
    name: version.name,
    module: version.module,
    purpose: version.purpose,
    siteId,
    fields: fieldsForSite(parseStoredFormSchema(version.fields), siteId),
    settings,
    capturedAt: new Date().toISOString(),
  };
}

export function asSnapshot(value: unknown): QuestionnaireSnapshot | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as QuestionnaireSnapshot).fields)) return null;
  return value as QuestionnaireSnapshot;
}

export function asAnswers(value: unknown): FormValues {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as FormValues) : {};
}
