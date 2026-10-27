import type { Prisma } from "@/generated/prisma/client";
import type { AudienceInput, DocumentStatusValue } from "@/lib/validation/documents";
import { audienceRowSelect, type AudienceRow } from "./document-access.policy";
import type { AudienceSummaryDto, NamedRef, VersionSummaryDto } from "./document.dto";

/** Prisma selections and pure mappers from database rows to API DTOs. */

export const versionSummarySelect = {
  id: true,
  versionNumber: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  changeNote: true,
  createdAt: true,
} satisfies Prisma.DocumentVersionSelect;

export const audienceNamedSelect = {
  ...audienceRowSelect,
  role: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.DocumentAudienceSelect;

type VersionSummaryRow = Prisma.DocumentVersionGetPayload<{ select: typeof versionSummarySelect }>;
type AudienceNamedRow = Prisma.DocumentAudienceGetPayload<{ select: typeof audienceNamedSelect }>;

export function toVersionSummary(v: VersionSummaryRow | null | undefined): VersionSummaryDto | null {
  if (!v) return null;
  return { ...v, createdAt: v.createdAt.toISOString() };
}

export function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export function toStatus(status: string): DocumentStatusValue {
  return status as DocumentStatusValue;
}

export function toAudienceSummary(rows: AudienceNamedRow[]): AudienceSummaryDto {
  const pick = <T extends NamedRef>(items: (T | null)[]) => items.filter((i): i is T => i !== null).sort((a, b) => a.name.localeCompare(b.name));
  return {
    allEmployees: rows.some((r) => r.type === "ALL_EMPLOYEES"),
    roles: pick(rows.filter((r) => r.type === "ROLE").map((r) => r.role)),
    businessUnits: pick(rows.filter((r) => r.type === "BUSINESS_UNIT").map((r) => r.businessUnit)),
    sites: pick(rows.filter((r) => r.type === "SITE").map((r) => r.site)),
    locations: pick(rows.filter((r) => r.type === "LOCATION").map((r) => r.location)),
    departments: pick(rows.filter((r) => r.type === "DEPARTMENT").map((r) => r.department)),
    users: pick(rows.filter((r) => r.type === "USER").map((r) => r.user)),
  };
}

/** Audience form input → audience rows (de-duplicated, every reference column explicit). */
export function audienceRowsFromInput(input: AudienceInput): AudienceRow[] {
  const uniq = (ids: string[]) => [...new Set(ids)];
  const empty = { roleId: null, businessUnitId: null, siteId: null, locationId: null, departmentId: null, userId: null };
  const rows: AudienceRow[] = [];
  if (input.allEmployees) rows.push({ ...empty, type: "ALL_EMPLOYEES" });
  uniq(input.roleIds).forEach((roleId) => rows.push({ ...empty, type: "ROLE", roleId }));
  uniq(input.businessUnitIds).forEach((businessUnitId) => rows.push({ ...empty, type: "BUSINESS_UNIT", businessUnitId }));
  uniq(input.siteIds).forEach((siteId) => rows.push({ ...empty, type: "SITE", siteId }));
  uniq(input.locationIds).forEach((locationId) => rows.push({ ...empty, type: "LOCATION", locationId }));
  uniq(input.departmentIds).forEach((departmentId) => rows.push({ ...empty, type: "DEPARTMENT", departmentId }));
  uniq(input.userIds).forEach((userId) => rows.push({ ...empty, type: "USER", userId }));
  return rows;
}

/** Audience rows → DocumentAudience create rows for one tenant (nested createMany). */
export function audienceCreateRows(rows: AudienceRow[], organizationId: string): Omit<Prisma.DocumentAudienceCreateManyInput, "documentId">[] {
  return rows.map((row) => ({ ...row, organizationId }));
}

/** DocumentAudience rows → the audience form shape (inverse of `audienceRowsFromInput`). */
export function audienceInputFromRows(rows: AudienceRow[]): AudienceInput {
  const ids = (type: string, pick: (r: AudienceRow) => string | null) =>
    rows.filter((r) => r.type === type).map(pick).filter((v): v is string => Boolean(v)).sort();
  return {
    allEmployees: rows.some((r) => r.type === "ALL_EMPLOYEES"),
    roleIds: ids("ROLE", (r) => r.roleId),
    businessUnitIds: ids("BUSINESS_UNIT", (r) => r.businessUnitId),
    siteIds: ids("SITE", (r) => r.siteId),
    locationIds: ids("LOCATION", (r) => r.locationId),
    departmentIds: ids("DEPARTMENT", (r) => r.departmentId),
    userIds: ids("USER", (r) => r.userId),
  };
}

export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
