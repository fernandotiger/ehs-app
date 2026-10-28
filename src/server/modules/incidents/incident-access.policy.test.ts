import { describe, expect, it } from "vitest";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import type { PermissionGrants, ScopeRef } from "@/lib/scope";
import { anonymousReporterKey } from "./anonymous-reporter";
import {
  actionVisibleWhere,
  actsAsAnonymousReporter,
  canAddReportEvidence,
  canArchiveIncident,
  canCompleteTask,
  canEditReport,
  canInvestigate,
  canReviewAction,
  canSeeConfidential,
  canSubmitReport,
  canWorkOnAction,
  confidentialVisibleWhere,
  incidentVisibleWhere,
  isReporter,
  type IncidentPrincipal,
  type IncidentRecordFacts,
} from "./incident-access.policy";

function principal(id: string, grants: Partial<Record<Permission, ScopeRef[]>>): IncidentPrincipal {
  return { id, grants: grants as PermissionGrants, permissions: Object.keys(grants) as Permission[] };
}

const COMPANY: ScopeRef[] = [{ type: "COMPANY", id: null }];
const DUBLIN: ScopeRef[] = [{ type: "SITE", id: "site-dublin" }];
const CORK_INCIDENT: IncidentRecordFacts = {
  businessUnitId: "bu",
  siteId: "site-cork",
  locationId: "loc-w",
  departmentId: "dep-w",
  reporterId: "john",
  isAnonymous: false,
  anonymousReporterKey: null,
  investigatorIds: ["liam"],
  isDraft: false,
  isConfidential: true,
  closed: false,
  archived: false,
};
/** John reported it anonymously: no reporter id, only his key. */
const ANONYMOUS_INCIDENT: IncidentRecordFacts = { ...CORK_INCIDENT, reporterId: null, isAnonymous: true, anonymousReporterKey: anonymousReporterKey("john") };

describe("incident visibility", () => {
  it("company scope sees everything", () => {
    expect(incidentVisibleWhere(principal("alex", { [P.INCIDENT_VIEW]: COMPANY }))).toEqual({});
  });

  it("site scope OR own reports OR assigned investigations", () => {
    expect(incidentVisibleWhere(principal("sam", { [P.INCIDENT_VIEW]: DUBLIN }))).toEqual({
      OR: [
        { OR: [{ siteId: { in: ["site-dublin"] } }] },
        { reporterId: "sam" },
        { anonymousReporterKey: anonymousReporterKey("sam") },
        { investigators: { some: { userId: "sam" } } },
      ],
    });
  });

  it("no view permission still sees own reports and assignments", () => {
    expect(incidentVisibleWhere(principal("john", {}))).toEqual({
      OR: [{ reporterId: "john" }, { anonymousReporterKey: anonymousReporterKey("john") }, { investigators: { some: { userId: "john" } } }],
    });
  });

  it("confidential details need the permission at the placement, or being the reporter/investigator", () => {
    expect(canSeeConfidential(principal("sam", { [P.INCIDENT_VIEW_CONFIDENTIAL]: DUBLIN }), CORK_INCIDENT)).toBe(false);
    expect(canSeeConfidential(principal("emma", { [P.INCIDENT_VIEW_CONFIDENTIAL]: COMPANY }), CORK_INCIDENT)).toBe(true);
    expect(canSeeConfidential(principal("john", {}), CORK_INCIDENT)).toBe(true);
    expect(canSeeConfidential(principal("liam", {}), CORK_INCIDENT)).toBe(true);
    expect(canSeeConfidential(principal("x", {}), { ...CORK_INCIDENT, isConfidential: false })).toBe(true);
    expect(confidentialVisibleWhere(principal("emma", { [P.INCIDENT_VIEW_CONFIDENTIAL]: COMPANY }))).toEqual({});
  });
});

describe("incident rights", () => {
  it("reporters edit drafts only; triagers edit until closed", () => {
    const john = principal("john", { [P.INCIDENT_CREATE]: COMPANY });
    expect(canEditReport(john, { ...CORK_INCIDENT, isDraft: true })).toBe(true);
    expect(canEditReport(john, CORK_INCIDENT)).toBe(false);
    const emma = principal("emma", { [P.INCIDENT_TRIAGE]: COMPANY });
    expect(canEditReport(emma, CORK_INCIDENT)).toBe(true);
    expect(canEditReport(emma, { ...CORK_INCIDENT, closed: true })).toBe(false);
  });

  it("assigned investigators investigate without the scoped permission", () => {
    expect(canInvestigate(principal("liam", {}), CORK_INCIDENT)).toBe(true);
    expect(canInvestigate(principal("sam", { [P.INCIDENT_INVESTIGATE]: DUBLIN }), CORK_INCIDENT)).toBe(false);
  });
});

describe("anonymous reports", () => {
  const john = principal("john", { [P.INCIDENT_CREATE]: COMPANY });
  const emma = principal("emma", { [P.INCIDENT_TRIAGE]: COMPANY, [P.INCIDENT_VIEW]: COMPANY });

  it("the key is stable per person and does not contain the id", () => {
    expect(anonymousReporterKey("john")).toBe(anonymousReporterKey("john"));
    expect(anonymousReporterKey("john")).not.toBe(anonymousReporterKey("jon"));
    expect(anonymousReporterKey("john")).not.toContain("john");
  });

  it("the reporter is recognised by the key only", () => {
    expect(isReporter(john, ANONYMOUS_INCIDENT)).toBe(true);
    expect(isReporter(emma, ANONYMOUS_INCIDENT)).toBe(false);
    expect(isReporter(principal("x", {}), { ...ANONYMOUS_INCIDENT, anonymousReporterKey: null })).toBe(false);
  });

  it("the reporter keeps the rights of a reporter on their own report", () => {
    const draft = { ...ANONYMOUS_INCIDENT, isDraft: true };
    expect(canEditReport(john, draft)).toBe(true);
    expect(canSubmitReport(john, draft)).toBe(true);
    expect(canArchiveIncident(john, draft)).toBe(true);
    expect(canSeeConfidential(john, ANONYMOUS_INCIDENT)).toBe(true);
    expect(canEditReport(principal("sam", { [P.INCIDENT_CREATE]: COMPANY }), draft)).toBe(false);
  });

  it("acting only as the reporter stays anonymous; triagers act under their name", () => {
    expect(actsAsAnonymousReporter(john, ANONYMOUS_INCIDENT)).toBe(true);
    expect(actsAsAnonymousReporter(emma, ANONYMOUS_INCIDENT)).toBe(false);
    expect(actsAsAnonymousReporter(john, CORK_INCIDENT)).toBe(false);
  });

  it("the reporter cannot add named evidence later; handlers can", () => {
    expect(canAddReportEvidence(john, ANONYMOUS_INCIDENT)).toBe(false);
    expect(canAddReportEvidence(john, { ...ANONYMOUS_INCIDENT, isDraft: true })).toBe(false);
    expect(canAddReportEvidence(john, CORK_INCIDENT)).toBe(true);
    expect(canAddReportEvidence(emma, ANONYMOUS_INCIDENT)).toBe(true);
    expect(canAddReportEvidence(principal("liam", {}), ANONYMOUS_INCIDENT)).toBe(true);
    expect(canAddReportEvidence(emma, { ...ANONYMOUS_INCIDENT, closed: true })).toBe(false);
  });
});

describe("action visibility and rights", () => {
  const action = { businessUnitId: "bu", siteId: "site-cork", locationId: null, departmentId: null, ownerId: "sam", reviewerId: "alex" };

  it("owner, reviewer, task owner or linked incident", () => {
    const where = actionVisibleWhere(principal("priya", {}));
    expect(where.OR).toHaveLength(4);
    expect(actionVisibleWhere(principal("alex", { [P.INCIDENT_ACTION_VIEW]: COMPANY }))).toEqual({});
  });

  it("admins act on others' work; owners need the complete permission", () => {
    const admin = principal("alex", { [P.INCIDENT_ACTION_ASSIGN]: COMPANY, [P.INCIDENT_ACTION_VERIFY]: COMPANY });
    expect(canWorkOnAction(admin, action)).toBe(true);
    expect(canWorkOnAction(principal("sam", { [P.INCIDENT_ACTION_COMPLETE]: COMPANY }), action)).toBe(true);
    expect(canWorkOnAction(principal("sam", {}), action)).toBe(false);
    expect(canWorkOnAction(principal("priya", { [P.INCIDENT_ACTION_COMPLETE]: COMPANY }), action)).toBe(false);
    expect(canCompleteTask(principal("priya", {}), action, { ownerId: "priya" })).toBe(true);
    expect(canReviewAction(principal("alex", {}), action)).toBe(true);
    expect(canReviewAction(principal("sam", { [P.INCIDENT_ACTION_VERIFY]: DUBLIN }), action)).toBe(false);
  });
});
