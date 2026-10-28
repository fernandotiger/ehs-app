import { describe, expect, it } from "vitest";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import type { PermissionGrants, ScopeRef } from "@/lib/scope";
import { actionRights, actionVisibleWhere, canCreateActionAt, canEditAction, canReopenAction, canWorkOnAction, type ActionPrincipal, type ActionRecordFacts } from "./action-access.policy";

function principal(id: string, grants: Partial<Record<Permission, ScopeRef[]>>): ActionPrincipal {
  return { id, grants: grants as PermissionGrants, permissions: Object.keys(grants) as Permission[] };
}

const COMPANY: ScopeRef[] = [{ type: "COMPANY", id: null }];
const DUBLIN: ScopeRef[] = [{ type: "SITE", id: "site-dublin" }];
const CORK: ActionRecordFacts = { businessUnitId: "bu", siteId: "site-cork", locationId: "loc-w", departmentId: "dep-3p", ownerId: "john", createdById: "sarah", status: "OPEN" };
const DUB: ActionRecordFacts = { ...CORK, siteId: "site-dublin", locationId: "loc-pf", departmentId: "dep-eng", ownerId: "priya", createdById: "priya" };

const admin = principal("alex", { [P.ACTION_VIEW]: COMPANY, [P.ACTION_CREATE]: COMPANY, [P.ACTION_MANAGE]: COMPANY });
const sam = principal("sam", { [P.ACTION_VIEW]: DUBLIN, [P.ACTION_MANAGE]: DUBLIN, [P.ACTION_CREATE]: COMPANY });
const john = principal("john", { [P.ACTION_CREATE]: COMPANY });
const sarah = principal("sarah", { [P.ACTION_CREATE]: [{ type: "SITE", id: "site-cork" }] });

describe("visibility", () => {
  it("company-wide action.view sees everything", () => {
    expect(actionVisibleWhere(admin)).toEqual({});
  });
  it("site scope OR own / created", () => {
    expect(actionVisibleWhere(sam)).toEqual({ OR: [{ OR: [{ siteId: { in: ["site-dublin"] } }] }, { ownerId: "sam" }, { createdById: "sam" }] });
  });
  it("without action.view only actions I own or created", () => {
    expect(actionVisibleWhere(john)).toEqual({ OR: [{ ownerId: "john" }, { createdById: "john" }] });
  });
});

describe("rights", () => {
  it("creating needs action.create covering the department (anywhere without one)", () => {
    expect(canCreateActionAt(sarah, CORK)).toBe(true);
    expect(canCreateActionAt(sarah, DUB)).toBe(false);
    expect(canCreateActionAt(sarah, null)).toBe(true);
    expect(canCreateActionAt(principal("x", {}), null)).toBe(false);
  });
  it("the owner works on it; a manager in scope does too without changing the owner", () => {
    expect(canWorkOnAction(john, CORK)).toBe(true);
    expect(canWorkOnAction(sam, CORK)).toBe(false);
    expect(canWorkOnAction(sam, DUB)).toBe(true);
    expect(canWorkOnAction(admin, CORK)).toBe(true);
  });
  it("the creator edits, cancels and reopens; the owner alone does not edit", () => {
    expect(canEditAction(sarah, CORK)).toBe(true);
    expect(canEditAction(john, CORK)).toBe(false);
    expect(actionRights(sarah, CORK)).toEqual({ edit: true, work: false, cancel: true, reopen: false });
    expect(canReopenAction(sarah, { ...CORK, status: "COMPLETED" })).toBe(true);
    expect(canReopenAction(john, { ...CORK, status: "COMPLETED" })).toBe(false);
  });
  it("finished actions cannot be edited or worked on", () => {
    const done = { ...CORK, status: "COMPLETED" as const };
    expect(actionRights(admin, done)).toEqual({ edit: false, work: false, cancel: false, reopen: true });
    expect(actionRights(john, { ...CORK, status: "CANCELLED" })).toEqual({ edit: false, work: false, cancel: false, reopen: false });
  });
});
