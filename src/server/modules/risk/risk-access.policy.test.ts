import { describe, expect, it } from "vitest";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import type { PermissionGrants, ScopeRef } from "@/lib/scope";
import {
  assessmentVisibleWhere,
  canApproveAssessment,
  canCreateAssessmentAt,
  canEditAssessment,
  canEditStrategy,
  canReviewAssessment,
  canWorkOnTask,
  seesConfidentialFlag,
  targetVisibleWhere,
  taskVisibleWhere,
  type AssessmentRecordFacts,
  type RiskPrincipal,
} from "./risk-access.policy";

function principal(id: string, grants: Partial<Record<Permission, ScopeRef[]>>): RiskPrincipal {
  return { id, grants: grants as PermissionGrants, permissions: Object.keys(grants) as Permission[] };
}

const COMPANY: ScopeRef[] = [{ type: "COMPANY", id: null }];
const DUBLIN: ScopeRef[] = [{ type: "SITE", id: "site-dublin" }];
const CORK: AssessmentRecordFacts = { businessUnitId: "bu", siteId: "site-cork", locationId: "loc-w", departmentId: "dep-3p", ownerId: "sarah", approverId: "alex", createdById: "alex", status: "APPROVED" };
const DUB: AssessmentRecordFacts = { ...CORK, siteId: "site-dublin", locationId: "loc-pf", departmentId: "dep-eng", ownerId: "sam" };

const admin = principal("alex", { [P.RISK_VIEW]: COMPANY, [P.RISK_EDIT]: COMPANY, [P.RISK_APPROVE]: COMPANY, [P.RISK_CREATE]: COMPANY, [P.RISK_TASK_VIEW]: COMPANY, [P.RISK_TASK_ASSIGN]: COMPANY, [P.RISK_CONFIGURE]: COMPANY });
const sam = principal("sam", { [P.RISK_VIEW]: DUBLIN, [P.RISK_EDIT]: DUBLIN, [P.RISK_APPROVE]: DUBLIN, [P.RISK_CREATE]: DUBLIN, [P.RISK_TASK_VIEW]: DUBLIN, [P.RISK_TASK_COMPLETE]: COMPANY, [P.RISK_CONFIGURE]: DUBLIN });
const priya = principal("priya", { [P.RISK_TASK_COMPLETE]: COMPANY });

describe("assessment visibility", () => {
  it("company scope sees everything", () => {
    expect(assessmentVisibleWhere(admin)).toEqual({});
  });
  it("site scope OR owner/approver/participant", () => {
    expect(assessmentVisibleWhere(sam)).toEqual({
      OR: [{ OR: [{ siteId: { in: ["site-dublin"] } }] }, { ownerId: "sam" }, { approverId: "sam" }, { participantIds: { has: "sam" } }],
    });
  });
  it("without risk.view only own involvement", () => {
    expect(assessmentVisibleWhere(priya)).toEqual({ OR: [{ ownerId: "priya" }, { approverId: "priya" }, { participantIds: { has: "priya" } }] });
  });
  it("tasks: risk.task.view scope or task owner; targets through their objective", () => {
    expect(taskVisibleWhere(priya)).toEqual({ OR: [{ ownerId: "priya" }] });
    expect(taskVisibleWhere(admin)).toEqual({});
    expect(targetVisibleWhere(admin)).toEqual({});
    expect(targetVisibleWhere(priya)).toEqual({ OR: [{ ownerId: "priya" }, { objective: { OR: [{ ownerId: "priya" }] } }] });
  });
});

describe("assessment rights", () => {
  it("Sam edits and approves in Dublin only", () => {
    expect(canEditAssessment(sam, DUB)).toBe(true);
    expect(canEditAssessment(sam, CORK)).toBe(false);
    expect(canApproveAssessment(sam, CORK)).toBe(false);
    expect(canApproveAssessment(admin, CORK)).toBe(true);
    expect(canCreateAssessmentAt(sam, CORK)).toBe(false);
    expect(canCreateAssessmentAt(sam, null)).toBe(true);
  });
  it("the responsible owner records periodic reviews", () => {
    expect(canReviewAssessment(principal("sarah", {}), CORK)).toBe(true);
    expect(canReviewAssessment(priya, CORK)).toBe(false);
  });
  it("a named approver needs the approve permission", () => {
    const named = { ...CORK, approverId: "priya" };
    expect(canApproveAssessment(priya, named)).toBe(false);
    expect(canApproveAssessment(principal("priya", { [P.RISK_APPROVE]: DUBLIN }), named)).toBe(true);
  });
  it("a draft author with risk.create may keep editing their draft", () => {
    const draft = { ...CORK, status: "DRAFT" as const, createdById: "liam", ownerId: null };
    expect(canEditAssessment(principal("liam", { [P.RISK_CREATE]: [{ type: "LOCATION", id: "loc-w" }] }), draft)).toBe(true);
    expect(canEditAssessment(principal("liam", { [P.RISK_CREATE]: [{ type: "LOCATION", id: "loc-w" }] }), { ...draft, status: "APPROVED" })).toBe(false);
  });
  it("the confidential flag is shown to company-wide configurators only", () => {
    expect(seesConfidentialFlag(admin)).toBe(true);
    expect(seesConfidentialFlag(sam)).toBe(false);
  });
});

describe("task and strategy rights", () => {
  const task = { businessUnitId: "bu", siteId: "site-dublin", locationId: "loc-pf", departmentId: "dep-eng", ownerId: "sam" };
  it("the owner or a manager completes; the admin acts without changing the owner", () => {
    expect(canWorkOnTask(sam, task)).toBe(true);
    expect(canWorkOnTask(priya, task)).toBe(false);
    expect(canWorkOnTask(priya, { ...task, ownerId: "priya" })).toBe(true);
    expect(canWorkOnTask(admin, task)).toBe(true);
  });
  it("strategy owners may update their records", () => {
    expect(canEditStrategy(priya, { ...task, ownerId: "priya" })).toBe(true);
    expect(canEditStrategy(priya, task)).toBe(false);
    expect(canEditStrategy(sam, { ...task, ownerId: "x" })).toBe(true);
  });
});
