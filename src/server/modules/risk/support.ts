import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { DbClient } from "@/server/db/client";
import { BusinessRuleError, ValidationError } from "@/server/http/errors";

/** Shared helpers for the Risk services (entity names, links, dates, snapshots). */

export { csvName, csvResponse, dateOnly, iso, loadNames, ref, toDate, todayFor, type NamedRef, type NameMaps } from "@/server/modules/incidents/support";

export const ASSESSMENT_ENTITY = "RiskAssessment";
export const TASK_ENTITY = "RiskTask";
export const PROGRAMME_ENTITY = "RiskProgramme";
export const OBJECTIVE_ENTITY = "RiskObjective";
export const TARGET_ENTITY = "RiskTarget";
export const RELATED_KIND = "related-assessment";

export const assessmentHref = (id: string) => `/risk/assessments/${id}`;
export const taskHref = (id: string) => `/risk/tasks/${id}`;
export const programmeHref = (id: string) => `/risk/strategy/programmes/${id}`;
export const objectiveHref = (id: string) => `/risk/strategy/objectives/${id}`;
export const targetHref = (id: string) => `/risk/strategy/targets/${id}`;

export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Throws the 422 business-rule error the UI renders as a list of what is missing. */
export function blocked(message: string, blockers: string[]): never {
  throw new BusinessRuleError(`${message}: ${blockers.join(" ")}`, { blockers });
}

/** Active directory users only (new choices); ids from another tenant are simply not found. */
export async function assertActiveUsers(db: DbClient, ids: readonly (string | null | undefined)[], what: string): Promise<void> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return;
  const found = await db.user.count({ where: { id: { in: unique }, isActive: true } });
  if (found !== unique.length) throw new ValidationError(`Choose active people from the directory for ${what}.`);
}

const LABEL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Stable QR label id (8 unambiguous characters), e.g. "L7KX2Q9M". */
export function newLabelId(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => LABEL_ALPHABET[b % LABEL_ALPHABET.length]).join("");
}

export const placementSelect = { businessUnitId: true, siteId: true, locationId: true, departmentId: true } as const;

export function placementOf(r: { businessUnitId: string | null; siteId: string | null; locationId: string | null; departmentId: string | null }) {
  return { businessUnitId: r.businessUnitId, siteId: r.siteId, locationId: r.locationId, departmentId: r.departmentId };
}
