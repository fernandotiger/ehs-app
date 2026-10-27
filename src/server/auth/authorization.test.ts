import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/permissions";
import type { PermissionGrants } from "@/lib/scope";
import { canAt, hasCompanyScope, requireAt, scopeWhere } from "./authorization";

const P = PERMISSIONS;

function principal(grants: PermissionGrants) {
  return { grants, permissions: Object.keys(grants) as (typeof P)[keyof typeof P][] };
}

const admin = principal({ [P.INCIDENT_VIEW]: [{ type: "COMPANY", id: null }] });
const siteManager = principal({
  [P.INCIDENT_VIEW]: [
    { type: "SITE", id: "dublin" },
    { type: "DEPARTMENT", id: "eng" },
  ],
  [P.RISK_VIEW]: [{ type: "BUSINESS_UNIT", id: "ops" }],
});
const nobody = principal({});

describe("scopeWhere (list specification)", () => {
  it("returns {} for company-wide access", () => {
    expect(scopeWhere(admin, P.INCIDENT_VIEW)).toEqual({});
  });

  it("returns an OR over the placement columns of the user's scopes", () => {
    expect(scopeWhere(siteManager, P.INCIDENT_VIEW)).toEqual({ OR: [{ siteId: { in: ["dublin"] } }, { departmentId: { in: ["eng"] } }] });
  });

  it("returns null without any grant", () => {
    expect(scopeWhere(nobody, P.INCIDENT_VIEW)).toBeNull();
    expect(scopeWhere(siteManager, P.AUDIT_VIEW)).toBeNull();
  });

  it("combines several permissions (any of them)", () => {
    expect(scopeWhere(siteManager, [P.INCIDENT_VIEW, P.RISK_VIEW])).toEqual({
      OR: [{ siteId: { in: ["dublin"] } }, { departmentId: { in: ["eng"] } }, { businessUnitId: { in: ["ops"] } }],
    });
    expect(scopeWhere(principal({ ...siteManager.grants, [P.AUDIT_VIEW]: [{ type: "COMPANY", id: null }] }), [P.INCIDENT_VIEW, P.AUDIT_VIEW])).toEqual({});
  });
});

describe("canAt / requireAt (single record)", () => {
  const dublinRecord = { businessUnitId: "ops", siteId: "dublin", locationId: "floor", departmentId: "ops-dept" };
  const corkRecord = { businessUnitId: "ops", siteId: "cork", locationId: "warehouse", departmentId: null };

  it("allows company scope everywhere", () => {
    expect(canAt(admin, P.INCIDENT_VIEW, corkRecord)).toBe(true);
    expect(canAt(admin, P.INCIDENT_VIEW, {})).toBe(true);
    expect(hasCompanyScope(admin, P.INCIDENT_VIEW)).toBe(true);
  });

  it("allows only records placed inside the scope", () => {
    expect(canAt(siteManager, P.INCIDENT_VIEW, dublinRecord)).toBe(true);
    expect(canAt(siteManager, P.INCIDENT_VIEW, corkRecord)).toBe(false);
    expect(canAt(siteManager, P.INCIDENT_VIEW, { ...corkRecord, departmentId: "eng" })).toBe(true);
    expect(canAt(siteManager, P.RISK_VIEW, corkRecord)).toBe(true);
    expect(hasCompanyScope(siteManager, P.INCIDENT_VIEW)).toBe(false);
  });

  it("never matches an unplaced record with a scoped grant", () => {
    expect(canAt(siteManager, P.INCIDENT_VIEW, {})).toBe(false);
  });

  it("throws 404 for reads and 403 otherwise", () => {
    expect(() => requireAt(siteManager, P.INCIDENT_VIEW, corkRecord, true)).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => requireAt(siteManager, P.INCIDENT_VIEW, corkRecord)).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => requireAt(siteManager, P.INCIDENT_VIEW, dublinRecord)).not.toThrow();
  });
});
