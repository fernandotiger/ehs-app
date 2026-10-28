import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { fieldsForSite, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import { parseStoredFormSchema } from "@/lib/forms/definition-schema";
import { ACTION_FORM_MODULE, ACTION_FORM_PURPOSE } from "@/lib/actions";
import type { DbClient } from "@/server/db/client";
import { BusinessRuleError, ValidationError } from "@/server/http/errors";

/** Shared helpers for the Actions services (entity name, links, dates, captured form). */

export { dateOnly, iso, loadNames, toDate, todayFor, type NamedRef, type NameMaps } from "@/server/modules/incidents/support";

export const ACTION_ENTITY = "Action";
export const actionHref = (id: string) => `/actions/${id}`;

export const ACTION_AUDIT = {
  CREATED: "ACTION_CREATED",
  UPDATED: "ACTION_UPDATED",
  STARTED: "ACTION_STARTED",
  COMPLETED: "ACTION_COMPLETED",
  CANCELLED: "ACTION_CANCELLED",
  REOPENED: "ACTION_REOPENED",
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

/** Captures a published Actions form version for one action (questions filtered for its site). */
export async function captureActionForm(db: DbClient, versionId: string, siteId: string | null): Promise<QuestionnaireSnapshot> {
  const version = await db.formVersion.findUnique({ where: { id: versionId } });
  if (!version || version.module !== ACTION_FORM_MODULE || version.purpose !== ACTION_FORM_PURPOSE) {
    throw new ValidationError("Choose a published action form.");
  }
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
