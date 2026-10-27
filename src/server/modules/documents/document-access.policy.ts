import type { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * Document visibility – Specification pattern.
 *
 * One rule decides which documents a user may see. It is expressed as a Prisma
 * `where` fragment so the SAME rule drives list queries, single-record reads and file
 * downloads (a user can never open something they could not list; out-of-scope
 * records are simply "not found").
 *
 * This file is pure (no I/O) and unit-tested.
 */

/**
 * The signed-in user as far as documents are concerned. The placement fields are the user's
 * home placement (business unit → site → location → department) and drive audience matching.
 */
export interface DocumentPrincipal {
  id: string;
  roleIds: string[];
  businessUnitId: string | null;
  siteId: string | null;
  locationId: string | null;
  departmentId: string | null;
  permissions: Permission[];
}

export type AudienceTypeValue = "ALL_EMPLOYEES" | "ROLE" | "BUSINESS_UNIT" | "SITE" | "LOCATION" | "DEPARTMENT" | "USER";

/** Audience rows as stored on a document (subset of DocumentAudience). */
export interface AudienceRow {
  type: AudienceTypeValue;
  roleId: string | null;
  businessUnitId: string | null;
  siteId: string | null;
  locationId: string | null;
  departmentId: string | null;
  userId: string | null;
}

/** Prisma select for the audience columns the policy needs. */
export const audienceRowSelect = {
  type: true,
  roleId: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
  userId: true,
} satisfies Prisma.DocumentAudienceSelect;

/** Users with manage or view-all permission can open any document in any status. */
export function canSeeAllDocuments(principal: Pick<DocumentPrincipal, "permissions">): boolean {
  return principal.permissions.includes(PERMISSIONS.DOCUMENTS_MANAGE) || principal.permissions.includes(PERMISSIONS.DOCUMENTS_VIEW_ALL);
}

/**
 * Audience rows that include the principal: all employees, one of their roles, their business
 * unit / site / location / department, or them by name.
 */
export function audienceMatchesPrincipal(principal: DocumentPrincipal): Prisma.DocumentAudienceWhereInput {
  const or: Prisma.DocumentAudienceWhereInput[] = [{ type: "ALL_EMPLOYEES" }, { type: "USER", userId: principal.id }];
  if (principal.roleIds.length) or.push({ type: "ROLE", roleId: { in: principal.roleIds } });
  if (principal.businessUnitId) or.push({ type: "BUSINESS_UNIT", businessUnitId: principal.businessUnitId });
  if (principal.siteId) or.push({ type: "SITE", siteId: principal.siteId });
  if (principal.locationId) or.push({ type: "LOCATION", locationId: principal.locationId });
  if (principal.departmentId) or.push({ type: "DEPARTMENT", departmentId: principal.departmentId });
  return { OR: or };
}

/**
 * Documents ASSIGNED to the principal: published and at least one audience matches.
 * This is what "My Documents" lists, regardless of elevated permissions.
 */
export function assignedDocumentsWhere(principal: DocumentPrincipal): Prisma.DocumentWhereInput {
  return { status: "PUBLISHED", audiences: { some: audienceMatchesPrincipal(principal) } };
}

/**
 * Documents the principal may OPEN (metadata, viewer page, file download).
 * Managers / view-all users see everything; everyone else only what is assigned to them.
 */
export function visibleDocumentsWhere(principal: DocumentPrincipal): Prisma.DocumentWhereInput {
  return canSeeAllDocuments(principal) ? {} : assignedDocumentsWhere(principal);
}

/** Only managers/view-all users may fetch superseded versions; everyone else gets the current one only. */
export function canAccessVersion(
  principal: Pick<DocumentPrincipal, "permissions">,
  document: { currentVersionId: string | null },
  versionId: string,
): boolean {
  return document.currentVersionId === versionId || canSeeAllDocuments(principal);
}

/**
 * The reverse direction: which USERS belong to a document's audience (the "required
 * population" for acknowledgement). Evaluated in SQL so it scales to large directories.
 * Only active users count. Returns a where that matches nobody when there are no audiences.
 */
export function audiencePopulationWhere(audiences: AudienceRow[]): Prisma.UserWhereInput {
  if (audiences.some((a) => a.type === "ALL_EMPLOYEES")) return { isActive: true };

  const ids = (type: AudienceRow["type"], pick: (a: AudienceRow) => string | null) =>
    [...new Set(audiences.filter((a) => a.type === type).map(pick).filter((v): v is string => Boolean(v)))];

  const roleIds = ids("ROLE", (a) => a.roleId);
  const businessUnitIds = ids("BUSINESS_UNIT", (a) => a.businessUnitId);
  const siteIds = ids("SITE", (a) => a.siteId);
  const locationIds = ids("LOCATION", (a) => a.locationId);
  const departmentIds = ids("DEPARTMENT", (a) => a.departmentId);
  const userIds = ids("USER", (a) => a.userId);

  const or: Prisma.UserWhereInput[] = [];
  // A role audience means "holds this role in any scope".
  if (roleIds.length) or.push({ roleAssignments: { some: { roleId: { in: roleIds } } } });
  if (businessUnitIds.length) or.push({ businessUnitId: { in: businessUnitIds } });
  if (siteIds.length) or.push({ siteId: { in: siteIds } });
  if (locationIds.length) or.push({ locationId: { in: locationIds } });
  if (departmentIds.length) or.push({ departmentId: { in: departmentIds } });
  if (userIds.length) or.push({ id: { in: userIds } });

  // `id: { in: [] }` matches nobody – a document without audiences has no population.
  return { isActive: true, ...(or.length ? { OR: or } : { id: { in: [] } }) };
}

/** Pure in-memory evaluation of the same rule (used for tests and single-user checks). */
export function audienceIncludesPrincipal(audiences: AudienceRow[], principal: DocumentPrincipal): boolean {
  return audiences.some((a) => {
    switch (a.type) {
      case "ALL_EMPLOYEES":
        return true;
      case "ROLE":
        return a.roleId !== null && principal.roleIds.includes(a.roleId);
      case "BUSINESS_UNIT":
        return a.businessUnitId !== null && a.businessUnitId === principal.businessUnitId;
      case "SITE":
        return a.siteId !== null && a.siteId === principal.siteId;
      case "LOCATION":
        return a.locationId !== null && a.locationId === principal.locationId;
      case "DEPARTMENT":
        return a.departmentId !== null && a.departmentId === principal.departmentId;
      case "USER":
        return a.userId === principal.id;
      default:
        return false;
    }
  });
}
