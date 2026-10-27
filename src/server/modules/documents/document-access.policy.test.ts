import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/permissions";
import { EMPTY_AUDIENCE } from "@/lib/validation/documents";
import {
  assignedDocumentsWhere,
  audienceIncludesPrincipal,
  audienceMatchesPrincipal,
  audiencePopulationWhere,
  canAccessVersion,
  visibleDocumentsWhere,
  type AudienceRow,
  type DocumentPrincipal,
} from "./document-access.policy";
import { audienceInputFromRows, audienceRowsFromInput } from "./document-mappers";

const row = (partial: Partial<AudienceRow> & Pick<AudienceRow, "type">): AudienceRow => ({
  roleId: null,
  businessUnitId: null,
  siteId: null,
  locationId: null,
  departmentId: null,
  userId: null,
  ...partial,
});

const nowhere = { businessUnitId: null, siteId: null, locationId: null, departmentId: null };
// Northstar: BU "ops-bu" → sites "dublin" (location "floor" → department "ops") and "cork" (location "warehouse").
const sarah: DocumentPrincipal = { id: "sarah", roleIds: ["employee", "manager"], businessUnitId: "ops-bu", siteId: "dublin", locationId: "floor", departmentId: "ops", permissions: [] };
const john: DocumentPrincipal = { id: "john", roleIds: ["employee"], businessUnitId: "ops-bu", siteId: "cork", locationId: "warehouse", departmentId: null, permissions: [] };
const hr: DocumentPrincipal = { id: "hr", roleIds: ["hr-admin"], businessUnitId: "ops-bu", siteId: "dublin", locationId: "floor", departmentId: "admin", permissions: [PERMISSIONS.DOCUMENTS_MANAGE] };
const viewer: DocumentPrincipal = { id: "v", roleIds: [], ...nowhere, permissions: [PERMISSIONS.DOCUMENTS_VIEW_ALL] };
const reporter: DocumentPrincipal = { id: "r", roleIds: [], ...nowhere, permissions: [PERMISSIONS.DOCUMENTS_ACK_REPORTS] };

const DOCS: Record<string, AudienceRow[]> = {
  "Annual Leave Policy": [row({ type: "ALL_EMPLOYEES" })],
  "Manager Absence Procedure": [row({ type: "ROLE", roleId: "manager" })],
  "Operations Handbook": [row({ type: "DEPARTMENT", departmentId: "ops" })],
  "Warehouse Safety Policy": [row({ type: "LOCATION", locationId: "warehouse" })],
  "Fire Safety Policy": [row({ type: "SITE", siteId: "dublin" })],
  "Code of Conduct": [row({ type: "BUSINESS_UNIT", businessUnitId: "ops-bu" })],
  "Named Only": [row({ type: "USER", userId: "priya" })],
};

const visibleTitles = (p: DocumentPrincipal) =>
  Object.entries(DOCS)
    .filter(([, audiences]) => audienceIncludesPrincipal(audiences, p))
    .map(([title]) => title);

describe("document visibility policy (in-memory rule)", () => {
  it("gives Sarah (Operations manager, Dublin Plant) her department, site, business unit and role documents", () => {
    expect(visibleTitles(sarah)).toEqual(["Annual Leave Policy", "Manager Absence Procedure", "Operations Handbook", "Fire Safety Policy", "Code of Conduct"]);
  });

  it("gives John (Warehouse, Cork) only what matches his placement – never the manager procedure", () => {
    expect(visibleTitles(john)).toEqual(["Annual Leave Policy", "Warehouse Safety Policy", "Code of Conduct"]);
    expect(audienceIncludesPrincipal(DOCS["Manager Absence Procedure"]!, john)).toBe(false);
  });

  it("matches when ANY of several audiences applies", () => {
    const multi = [row({ type: "ROLE", roleId: "manager" }), row({ type: "USER", userId: "john" })];
    expect(audienceIncludesPrincipal(multi, john)).toBe(true);
    expect(audienceIncludesPrincipal(multi, sarah)).toBe(true);
    expect(audienceIncludesPrincipal(multi, { ...john, id: "someone-else" })).toBe(false);
  });

  it("does not match null structure ids against a principal without a placement", () => {
    const orphan: DocumentPrincipal = { id: "x", roleIds: [], ...nowhere, permissions: [] };
    for (const type of ["BUSINESS_UNIT", "SITE", "LOCATION", "DEPARTMENT"] as const) {
      expect(audienceIncludesPrincipal([row({ type })], orphan)).toBe(false);
    }
    expect(audienceIncludesPrincipal([], orphan)).toBe(false);
  });
});

describe("document visibility policy (Prisma specification)", () => {
  it("restricts ordinary users to published documents with a matching audience", () => {
    expect(visibleDocumentsWhere(sarah)).toEqual({
      status: "PUBLISHED",
      audiences: {
        some: {
          OR: [
            { type: "ALL_EMPLOYEES" },
            { type: "USER", userId: "sarah" },
            { type: "ROLE", roleId: { in: ["employee", "manager"] } },
            { type: "BUSINESS_UNIT", businessUnitId: "ops-bu" },
            { type: "SITE", siteId: "dublin" },
            { type: "LOCATION", locationId: "floor" },
            { type: "DEPARTMENT", departmentId: "ops" },
          ],
        },
      },
    });
  });

  it("omits role and structure clauses the principal cannot match", () => {
    const bare: DocumentPrincipal = { id: "b", roleIds: [], ...nowhere, permissions: [] };
    expect(audienceMatchesPrincipal(bare)).toEqual({ OR: [{ type: "ALL_EMPLOYEES" }, { type: "USER", userId: "b" }] });
    expect(audienceMatchesPrincipal(john).OR).not.toContainEqual(expect.objectContaining({ type: "DEPARTMENT" }));
  });

  it("lets documents.manage and documents.view_all see everything, but not report-only users", () => {
    expect(visibleDocumentsWhere(hr)).toEqual({});
    expect(visibleDocumentsWhere(viewer)).toEqual({});
    expect(visibleDocumentsWhere(reporter)).toEqual(assignedDocumentsWhere(reporter));
  });

  it("keeps My Documents to assigned documents even for managers", () => {
    expect(assignedDocumentsWhere(hr)).toMatchObject({ status: "PUBLISHED" });
  });

  it("only allows historic versions for managers / view-all", () => {
    const doc = { currentVersionId: "v2" };
    expect(canAccessVersion(john, doc, "v2")).toBe(true);
    expect(canAccessVersion(john, doc, "v1")).toBe(false);
    expect(canAccessVersion(hr, doc, "v1")).toBe(true);
    expect(canAccessVersion(viewer, doc, "v1")).toBe(true);
  });
});

describe("audience population (users in a document's audience)", () => {
  it("is every active user for ALL_EMPLOYEES", () => {
    expect(audiencePopulationWhere([row({ type: "ALL_EMPLOYEES" }), row({ type: "ROLE", roleId: "manager" })])).toEqual({ isActive: true });
  });

  it("ORs role assignments, structure placement and named users (de-duplicated)", () => {
    expect(
      audiencePopulationWhere([
        row({ type: "ROLE", roleId: "manager" }),
        row({ type: "ROLE", roleId: "manager" }),
        row({ type: "BUSINESS_UNIT", businessUnitId: "ops-bu" }),
        row({ type: "SITE", siteId: "cork" }),
        row({ type: "LOCATION", locationId: "warehouse" }),
        row({ type: "DEPARTMENT", departmentId: "ops" }),
        row({ type: "USER", userId: "john" }),
      ]),
    ).toEqual({
      isActive: true,
      OR: [
        { roleAssignments: { some: { roleId: { in: ["manager"] } } } },
        { businessUnitId: { in: ["ops-bu"] } },
        { siteId: { in: ["cork"] } },
        { locationId: { in: ["warehouse"] } },
        { departmentId: { in: ["ops"] } },
        { id: { in: ["john"] } },
      ],
    });
  });

  it("matches nobody when there is no audience", () => {
    expect(audiencePopulationWhere([])).toEqual({ isActive: true, id: { in: [] } });
  });
});

describe("audience mappers", () => {
  it("round-trips form input through audience rows", () => {
    const input = { ...EMPTY_AUDIENCE, roleIds: ["manager", "manager"], businessUnitIds: ["ops-bu"], siteIds: ["dublin"], userIds: ["john"] };
    const rows = audienceRowsFromInput(input);
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.type === "SITE")).toEqual(row({ type: "SITE", siteId: "dublin" }));
    expect(audienceInputFromRows(rows)).toEqual({ ...input, roleIds: ["manager"] });
  });
});
