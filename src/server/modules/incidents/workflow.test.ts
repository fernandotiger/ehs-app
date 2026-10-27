import { describe, expect, it } from "vitest";
import {
  actionCompletionBlockers,
  actionReviewBlockers,
  closureBlockers,
  daysLost,
  deriveIncidentStatus,
  draftBlockers,
  followUpBlockers,
  investigationCompletionBlockers,
  investigationDataErrors,
  isActionResolved,
  isActionOverdue,
  lifecycle,
  matchesTrend,
  nextStep,
  submitBlockers,
  trendCriteriaErrors,
  type ActionNode,
  type ClosureFacts,
  type InvestigationFacts,
  type ReportFacts,
} from "./workflow";

// Examples use the common 20 October 2026 clock (spec examples I-01…I-12).
const TODAY = "2026-10-20";

function action(id: string, state: ActionNode["state"], incidentIds: string[] = ["inc1"], parentActionId: string | null = null): ActionNode {
  return { id, reference: id.toUpperCase(), state, incidentIds, parentActionId };
}

const completed = { status: "COMPLETED" as const, actionsRequired: true };

function report(overrides: Partial<ReportFacts> = {}): ReportFacts {
  return {
    title: "Loose ladder foot spotted before use",
    occurredAt: "2026-10-20T09:15",
    departmentId: "dep-eng",
    investigationTargetDate: "2026-10-27",
    typeActive: true,
    typeHasSubtypes: true,
    subtypeId: "sub-equipment",
    subtypeValid: true,
    people: [{ name: "Unknown" }],
    investigatorCount: 1,
    assignmentRequired: true,
    multipleInvestigators: true,
    missingAnswers: [],
    now: "2026-10-20T12:00",
    ...overrides,
  };
}

function investigation(overrides: Partial<InvestigationFacts> = {}): InvestigationFacts {
  return {
    investigatorId: "sam",
    causeIds: ["cause-inadequate-procedure"],
    closingDecision: "Replace the ladder and update checks",
    actionsRequired: true,
    healthSafetyImpact: true,
    hazardGroup: "Work equipment",
    environmentalImpact: false,
    environmentalAspect: null,
    environmentalDescription: null,
    environmentalDuration: null,
    reportable: false,
    reporteeIds: [],
    absences: [],
    operatingHoursLost: null,
    missingAnswers: [],
    ...overrides,
  };
}

function closure(overrides: Partial<ClosureFacts> = {}): ClosureFacts {
  return { isDraft: false, closed: false, investigation: completed, actions: [], investigationRequired: true, closureNote: "All corrective work verified", ...overrides };
}

describe("I-01 / I-02 reporting", () => {
  it("accepts a complete report (Unknown is a valid name)", () => {
    expect(submitBlockers(report())).toEqual([]);
  });

  it("a draft only needs a title", () => {
    expect(draftBlockers({ title: "Loading-bay observation", investigatorCount: 0, multipleInvestigators: true })).toEqual([]);
    expect(draftBlockers({ title: "  ", investigatorCount: 0, multipleInvestigators: true })).toEqual(["Enter an incident title."]);
  });

  it("submission lists every missing item", () => {
    const blockers = submitBlockers(
      report({ title: "Loading-bay observation", people: [], departmentId: null, investigatorCount: 0, missingAnswers: ["Describe equipment damage"] }),
    );
    expect(blockers).toEqual([
      "Choose the department where it happened.",
      "Add at least one person involved (enter Unknown if the name is not known).",
      "Assign an investigator.",
      "Answer the required question “Describe equipment damage”.",
    ]);
  });

  it("a blank person name is rejected", () => {
    expect(submitBlockers(report({ people: [{ name: "" }] }))).toContain("Enter a name for every person, or Unknown if the name is not known.");
  });

  it("a single-investigator type rejects more than one investigator (also for drafts)", () => {
    expect(submitBlockers(report({ multipleInvestigators: false, investigatorCount: 2 }))).toContain("This incident type allows only one investigator.");
    expect(draftBlockers({ title: "x", multipleInvestigators: false, investigatorCount: 2 })).toEqual(["This incident type allows only one investigator."]);
  });

  it("requires an active type and a valid subtype, a date that is not in the future and a target date", () => {
    const blockers = submitBlockers(report({ typeActive: false, subtypeId: "x", subtypeValid: false, occurredAt: "2026-10-21T08:00", investigationTargetDate: null }));
    expect(blockers).toEqual([
      "Choose an active incident type.",
      "Choose an active subtype of this incident type.",
      "The date and time of the event cannot be in the future.",
      "Enter the investigation target date.",
    ]);
    expect(submitBlockers(report({ subtypeId: null }))).toContain("Choose a subtype.");
  });

  it("assignment can be optional", () => {
    expect(submitBlockers(report({ assignmentRequired: false, investigatorCount: 0 }))).toEqual([]);
  });
});

describe("status derivation (Registers and states)", () => {
  it("Draft and Closed take precedence", () => {
    expect(deriveIncidentStatus({ isDraft: true, closed: false, investigation: null, actions: [] })).toBe("DRAFT");
    expect(deriveIncidentStatus({ isDraft: false, closed: true, investigation: completed, actions: [action("a", "OPEN")] })).toBe("CLOSED");
  });

  it("Open without investigation, Investigating while in progress", () => {
    expect(deriveIncidentStatus({ isDraft: false, closed: false, investigation: null, actions: [] })).toBe("OPEN");
    expect(deriveIncidentStatus({ isDraft: false, closed: false, investigation: { status: "IN_PROGRESS", actionsRequired: null }, actions: [] })).toBe("INVESTIGATING");
  });

  it("I-03: a completed investigation needing action with none linked is Action required", () => {
    expect(deriveIncidentStatus({ isDraft: false, closed: false, investigation: completed, actions: [] })).toBe("ACTION_REQUIRED");
  });

  it("follows the action states", () => {
    const base = { isDraft: false, closed: false, investigation: completed };
    expect(deriveIncidentStatus({ ...base, actions: [action("a", "IN_PROGRESS"), action("b", "AWAITING_EFFECTIVENESS")] })).toBe("ACTION_IN_PROGRESS");
    expect(deriveIncidentStatus({ ...base, actions: [action("a", "AWAITING_EFFECTIVENESS"), action("b", "EFFECTIVE")] })).toBe("AWAITING_EFFECTIVENESS");
    expect(deriveIncidentStatus({ ...base, actions: [action("a", "EFFECTIVE")] })).toBe("READY_TO_CLOSE");
    expect(deriveIncidentStatus({ ...base, investigation: { status: "COMPLETED", actionsRequired: false }, actions: [] })).toBe("READY_TO_CLOSE");
  });
});

describe("I-07 ineffective action and follow-up chain", () => {
  const original = action("a1", "INEFFECTIVE", ["inc1", "inc2"]);

  it("is unresolved without follow-ups", () => {
    expect(isActionResolved(original, [original])).toBe(false);
  });

  it("an open sibling follow-up keeps blocking; both effective resolves", () => {
    const f1 = action("f1", "EFFECTIVE", ["inc1", "inc2"], "a1");
    const f2 = action("f2", "OPEN", ["inc1", "inc2"], "a1");
    const graph = [original, f1, f2];
    expect(isActionResolved(original, graph)).toBe(false);
    expect(deriveIncidentStatus({ isDraft: false, closed: false, investigation: completed, actions: graph })).toBe("FOLLOW_UP_REQUIRED");
    const resolved = [original, f1, { ...f2, state: "EFFECTIVE" as const }];
    expect(isActionResolved(original, resolved)).toBe(true);
    expect(deriveIncidentStatus({ isDraft: false, closed: false, investigation: completed, actions: resolved })).toBe("READY_TO_CLOSE");
  });

  it("resolves recursively through an ineffective follow-up that has an effective follow-up", () => {
    const f1 = action("f1", "INEFFECTIVE", ["inc1", "inc2"], "a1");
    const f11 = action("f11", "EFFECTIVE", ["inc1", "inc2"], "f1");
    expect(isActionResolved(original, [original, f1, f11])).toBe(true);
    expect(isActionResolved(original, [original, f1])).toBe(false);
  });

  it("a follow-up that dropped an original incident does not count", () => {
    const partial = action("f1", "EFFECTIVE", ["inc1"], "a1");
    expect(isActionResolved(original, [original, partial])).toBe(false);
  });

  it("is safe against cycles", () => {
    const a = action("a", "INEFFECTIVE", ["inc1"], "b");
    const b = action("b", "INEFFECTIVE", ["inc1"], "a");
    expect(isActionResolved(a, [a, b])).toBe(false);
  });

  it("follow-up is only raised from an ineffective action", () => {
    expect(followUpBlockers("INEFFECTIVE")).toEqual([]);
    expect(followUpBlockers("AWAITING_EFFECTIVENESS")).toHaveLength(1);
  });
});

describe("I-09 closure gates", () => {
  it("each blocked case explains the remaining requirement", () => {
    expect(closureBlockers(closure({ isDraft: true }))).toEqual(["Submit the report before closing it."]);
    expect(closureBlockers(closure({ investigation: null }))).toEqual(["This incident type requires an investigation – start and complete it first."]);
    expect(closureBlockers(closure({ investigation: { status: "IN_PROGRESS", actionsRequired: null } }))).toEqual(["Complete the investigation first – it is still in progress."]);
    expect(closureBlockers(closure({ actions: [] }))).toEqual(["The investigation says action is required – add or link an action first."]);
    expect(closureBlockers(closure({ actions: [action("act-1", "AWAITING_EFFECTIVENESS")] }))).toEqual(["ACT-1 is effectiveness review pending."]);
    expect(closureBlockers(closure({ actions: [action("act-1", "EFFECTIVE")], closureNote: "  " }))).toEqual(["Enter a closure note."]);
  });

  it("closes with a completed investigation, resolved actions and a note", () => {
    expect(closureBlockers(closure({ actions: [action("act-1", "EFFECTIVE")] }))).toEqual([]);
  });

  it("optional-investigation type may close without an investigation", () => {
    expect(closureBlockers(closure({ investigation: null, investigationRequired: false }))).toEqual([]);
    expect(closureBlockers(closure({ investigation: null, investigationRequired: false, actions: [action("a", "OPEN")] }))).toEqual(["A is not completed yet."]);
  });

  it("an unresolved ineffective action blocks closure (I-07)", () => {
    const original = action("a1", "INEFFECTIVE");
    const open = action("f1", "OPEN", ["inc1"], "a1");
    const blockers = closureBlockers(closure({ actions: [original, open] }));
    expect(blockers).toEqual(["A1 is ineffective – its follow-up actions are not all effective yet.", "F1 is not completed yet."]);
  });

  it("ignoreNote reports readiness before the note is typed", () => {
    expect(closureBlockers(closure({ closureNote: "", actions: [action("a", "EFFECTIVE")] }), { ignoreNote: true })).toEqual([]);
  });
});

describe("I-03 / I-04 investigation completion and days lost", () => {
  it("I-03 complete investigation passes", () => {
    expect(investigationCompletionBlockers(investigation())).toEqual([]);
  });

  it("missing causes, findings/root cause, hazard and closing decision block completion", () => {
    const blockers = investigationCompletionBlockers(
      investigation({ causeIds: [], hazardGroup: null, closingDecision: "", missingAnswers: ["Investigation findings", "Root cause analysis"] }),
    );
    expect(blockers).toEqual([
      "Answer the required question “Investigation findings”.",
      "Answer the required question “Root cause analysis”.",
      "Choose the hazard group for the health & safety impact.",
      "Choose at least one cause.",
      "Enter the closing decision.",
    ]);
  });

  it("environmental impact needs aspect and description; action decision must be made", () => {
    const blockers = investigationCompletionBlockers(investigation({ environmentalImpact: true, actionsRequired: null, investigatorId: null }));
    expect(blockers).toEqual([
      "Choose the investigator.",
      "Choose the environmental aspect.",
      "Describe the environmental impact.",
      "Say whether actions are required.",
    ]);
  });

  it("I-04 reportable needs a reportee", () => {
    expect(investigationCompletionBlockers(investigation({ reportable: true }))).toEqual(["Choose at least one reportee for a reportable incident."]);
    expect(investigationCompletionBlockers(investigation({ reportable: true, reporteeIds: ["ehs-leadership"] }))).toEqual([]);
  });

  it("I-04 days lost: inclusive calendar days, Restricted duties excluded, no de-duplication", () => {
    const absences = [
      { startDate: "2026-10-15", endDate: "2026-10-17", restricted: false },
      { startDate: "2026-10-18", endDate: "2026-10-19", restricted: true },
    ];
    expect(daysLost(absences)).toBe(3);
    expect(daysLost([...absences, { startDate: "2026-10-16", endDate: "2026-10-16", restricted: false }])).toBe(4);
    expect(daysLost([])).toBe(0);
  });

  it("rejects reversed absence dates and negative hours/duration on every save", () => {
    expect(
      investigationDataErrors({ absences: [{ startDate: "2026-10-17", endDate: "2026-10-15" }], operatingHoursLost: -1, environmentalDuration: -5 }),
    ).toEqual([
      "Absence period 1: the end date is before the start date.",
      "Operating hours lost cannot be negative.",
      "The environmental impact duration cannot be negative.",
    ]);
    expect(investigationDataErrors({ absences: [], operatingHoursLost: 4, environmentalDuration: null })).toEqual([]);
  });
});

describe("I-05 / I-06 action completion and review", () => {
  const base = { state: "OPEN" as const, completionComment: "Replacement inspected and issued", reviewerId: "alex", plannedReviewDate: TODAY };

  it("an open child task blocks completion", () => {
    expect(actionCompletionBlockers({ ...base, tasks: [{ title: "Order replacement", done: false }] })).toEqual([
      "Complete every task first (1 still open: Order replacement).",
    ]);
    expect(actionCompletionBlockers({ ...base, tasks: [{ title: "Order replacement", done: true }] })).toEqual([]);
  });

  it("completion needs a comment, reviewer and review date", () => {
    expect(actionCompletionBlockers({ state: "IN_PROGRESS", tasks: [], completionComment: "", reviewerId: null, plannedReviewDate: null })).toEqual([
      "Describe what was done.",
      "Choose who will review effectiveness.",
      "Choose the effectiveness review date.",
    ]);
  });

  it("review needs the planned date to have arrived and a comment (I-06)", () => {
    expect(actionReviewBlockers({ state: "AWAITING_EFFECTIVENESS", plannedReviewDate: "2026-10-25", today: TODAY, comment: "Looks good" })).toEqual([
      "Effectiveness can be recorded from 2026-10-25 (the planned review date).",
    ]);
    expect(actionReviewBlockers({ state: "AWAITING_EFFECTIVENESS", plannedReviewDate: TODAY, today: TODAY, comment: "" })).toEqual(["Enter a review comment."]);
    expect(actionReviewBlockers({ state: "AWAITING_EFFECTIVENESS", plannedReviewDate: TODAY, today: TODAY, comment: "Checked in use; control is effective" })).toEqual([]);
    expect(actionReviewBlockers({ state: "OPEN", plannedReviewDate: TODAY, today: TODAY, comment: "x" })).toHaveLength(1);
  });

  it("overdue uses the due date, then the review date", () => {
    expect(isActionOverdue({ state: "OPEN", dueDate: "2026-10-19" }, TODAY)).toBe(true);
    expect(isActionOverdue({ state: "OPEN", dueDate: TODAY }, TODAY)).toBe(false);
    expect(isActionOverdue({ state: "AWAITING_EFFECTIVENESS", dueDate: "2026-01-01", plannedReviewDate: "2026-10-19" }, TODAY)).toBe(true);
    expect(isActionOverdue({ state: "EFFECTIVE", dueDate: "2026-01-01" }, TODAY)).toBe(false);
  });
});

describe("I-08 shared action", () => {
  it("one action linked to two incidents drives both, each keeps its own gates", () => {
    const shared = action("act", "EFFECTIVE", ["inc1", "inc2"]);
    expect(deriveIncidentStatus({ isDraft: false, closed: false, investigation: completed, actions: [shared] })).toBe("READY_TO_CLOSE");
    expect(deriveIncidentStatus({ isDraft: false, closed: false, investigation: { status: "IN_PROGRESS", actionsRequired: null }, actions: [shared] })).toBe(
      "INVESTIGATING",
    );
  });
});

describe("next step and lifecycle", () => {
  it("maps each status to one primary step", () => {
    expect(nextStep("DRAFT", { investigationEnabled: true })).toBe("SUBMIT");
    expect(nextStep("OPEN", { investigationEnabled: true })).toBe("START_INVESTIGATION");
    expect(nextStep("OPEN", { investigationEnabled: false })).toBe("CLOSE");
    expect(nextStep("ACTION_REQUIRED", { investigationEnabled: true })).toBe("ADD_ACTION");
    expect(nextStep("FOLLOW_UP_REQUIRED", { investigationEnabled: true })).toBe("FOLLOW_UP");
    expect(nextStep("CLOSED", { investigationEnabled: true })).toBe("REOPEN");
  });

  it("marks exactly one current stage", () => {
    const stages = lifecycle({ isDraft: false, closed: false, investigation: completed, actions: [action("a", "AWAITING_EFFECTIVENESS")], investigationEnabled: true });
    expect(stages.map((s) => s.state)).toEqual(["done", "done", "done", "current", "todo"]);
    const closed = lifecycle({ isDraft: false, closed: true, investigation: null, actions: [], investigationEnabled: false });
    expect(closed.map((s) => s.state)).toEqual(["done", "skipped", "skipped", "skipped", "done"]);
  });
});

describe("I-11 trends", () => {
  const criteria = { from: "2026-10-01", to: "2026-10-20", typeId: "near-miss", departmentId: "dep-eng" };
  const candidate = { isDraft: false, archived: false, occurredAt: "2026-10-05T09:00:00Z", typeId: "near-miss", subtypeId: null, departmentId: "dep-eng", causeIds: [] };

  it("matches active submitted incidents in the period", () => {
    expect(matchesTrend(candidate, criteria)).toBe(true);
    expect(matchesTrend({ ...candidate, isDraft: true }, criteria)).toBe(false);
    expect(matchesTrend({ ...candidate, archived: true }, criteria)).toBe(false);
    expect(matchesTrend({ ...candidate, occurredAt: "2026-10-21T09:00:00Z" }, criteria)).toBe(false);
    expect(matchesTrend({ ...candidate, departmentId: "other" }, criteria)).toBe(false);
    expect(matchesTrend({ ...candidate, causeIds: ["c1"] }, { ...criteria, causeId: "c1" })).toBe(true);
  });

  it("needs a valid period and at least a type, subtype or cause", () => {
    expect(trendCriteriaErrors({ from: "2026-10-20", to: "2026-10-01" })).toEqual(["The period end is before its start.", "Choose at least a type, subtype or cause."]);
    expect(trendCriteriaErrors(criteria)).toEqual([]);
  });
});
