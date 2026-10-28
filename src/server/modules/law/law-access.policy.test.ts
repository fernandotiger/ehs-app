import { describe, expect, it } from "vitest";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import type { PermissionGrants, ScopeRef } from "@/lib/scope";
import {
  canConfirmReview,
  canEditProfile,
  canEvaluate,
  canInstallContent,
  profileVisibleWhere,
  requirementVisibleWhere,
  taskRights,
  taskVisibleWhere,
  type LawPrincipal,
  type LawTaskRecordFacts,
  type RequirementRecordFacts,
} from "./law-access.policy";

function principal(id: string, grants: Partial<Record<Permission, ScopeRef[]>>): LawPrincipal {
  return { id, grants: grants as PermissionGrants, permissions: Object.keys(grants) as Permission[] };
}

const COMPANY: ScopeRef[] = [{ type: "COMPANY", id: null }];
const DUBLIN: ScopeRef[] = [{ type: "SITE", id: "site-dublin" }];
const CORK_SITE: ScopeRef[] = [{ type: "SITE", id: "site-cork" }];

const admin = principal("alex", { [P.LAW_VIEW]: COMPANY, [P.LAW_REQUIREMENT_MANAGE]: COMPANY, [P.LAW_EVALUATION_CREATE]: COMPANY, [P.LAW_EVALUATION_APPROVE]: COMPANY });
const sam = principal("sam", { [P.LAW_VIEW]: DUBLIN, [P.LAW_REQUIREMENT_MANAGE]: DUBLIN, [P.LAW_EVALUATION_CREATE]: DUBLIN, [P.LAW_EVALUATION_APPROVE]: DUBLIN });
const sarah = principal("sarah", { [P.LAW_VIEW]: CORK_SITE });
const john = principal("john", {});

const corkReq: RequirementRecordFacts = { businessUnitId: "bu", siteId: "site-cork", locationId: "loc-w", departmentId: "dep-3p", ownerId: "sarah", profileOwnerId: "emma" };
const dublinReq: RequirementRecordFacts = { businessUnitId: "bu", siteId: "site-dublin", locationId: null, departmentId: null, ownerId: null, profileOwnerId: "sam" };

describe("visibility (one where for lists and detail)", () => {
  it("company-wide manage sees every profile, private ones too", () => {
    expect(profileVisibleWhere(admin)).toEqual({});
    expect(requirementVisibleWhere(admin)).toEqual({});
    expect(taskVisibleWhere(admin)).toEqual({});
  });
  it("view-only scope sees shared profiles of its site, plus its own", () => {
    expect(profileVisibleWhere(sarah)).toEqual({ OR: [{ ownerId: "sarah" }, { AND: [{ OR: [{ siteId: { in: ["site-cork"] } }] }, { isShared: true }] }] });
    expect(requirementVisibleWhere(sarah)).toEqual({
      OR: [{ ownerId: "sarah" }, { profile: { ownerId: "sarah" } }, { tasks: { some: { ownerId: "sarah" } } }, { AND: [{ OR: [{ siteId: { in: ["site-cork"] } }] }, { profile: { isShared: true } }] }],
    });
  });
  it("site managers also see private profiles of their site", () => {
    const where = profileVisibleWhere(sam);
    expect(where.OR).toContainEqual({ OR: [{ siteId: { in: ["site-dublin"] } }] });
  });
  it("without law.view only own requirements (or ones behind my tasks) and own / created tasks", () => {
    expect(requirementVisibleWhere(john)).toEqual({ OR: [{ ownerId: "john" }, { profile: { ownerId: "john" } }, { tasks: { some: { ownerId: "john" } } }] });
    expect(taskVisibleWhere(john)).toEqual({ OR: [{ ownerId: "john" }, { createdById: "john" }, { requirement: requirementVisibleWhere(john) }] });
  });
});

describe("rights", () => {
  it("evaluators in scope, the requirement owner and the profile owner may evaluate", () => {
    expect(canEvaluate(admin, corkReq)).toBe(true);
    expect(canEvaluate(sam, corkReq)).toBe(false);
    expect(canEvaluate(sam, dublinReq)).toBe(true);
    expect(canEvaluate(sarah, corkReq)).toBe(true); // responsible owner
    expect(canEvaluate(principal("emma", {}), corkReq)).toBe(true); // profile owner
    expect(canEvaluate(john, corkReq)).toBe(false);
  });
  it("confirming a content review needs approve in scope or ownership", () => {
    expect(canConfirmReview(sam, dublinReq)).toBe(true);
    expect(canConfirmReview(principal("x", { [P.LAW_EVALUATION_CREATE]: COMPANY }), dublinReq)).toBe(false);
    expect(canConfirmReview(sarah, corkReq)).toBe(true);
  });
  it("profiles: managers at the site or the owner edit; installing content is company-wide", () => {
    expect(canEditProfile(sam, { ...dublinReq, ownerId: "emma" })).toBe(true);
    expect(canEditProfile(sam, { ...corkReq, ownerId: "emma" })).toBe(false);
    expect(canEditProfile(principal("emma", {}), { ...corkReq, ownerId: "emma" })).toBe(true);
    expect(canInstallContent(admin)).toBe(true);
    expect(canInstallContent(sam)).toBe(false);
  });
  it("tasks: owner completes, creator edits, evaluators do both without changing the owner", () => {
    const task: LawTaskRecordFacts = { ...corkReq, ownerId: "john", createdById: "sarah", status: "OPEN", archived: false };
    expect(taskRights(john, task)).toEqual({ work: true, edit: false, archive: false, restore: false });
    expect(taskRights(sarah, task)).toEqual({ work: false, edit: true, archive: true, restore: false });
    expect(taskRights(admin, task)).toEqual({ work: true, edit: true, archive: true, restore: false });
    expect(taskRights(admin, { ...task, status: "COMPLETED" })).toEqual({ work: false, edit: false, archive: true, restore: false });
    expect(taskRights(sarah, { ...task, archived: true })).toEqual({ work: false, edit: false, archive: false, restore: true });
  });
});
