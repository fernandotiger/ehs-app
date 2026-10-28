import { describe, expect, it } from "vitest";
import {
  complianceSummary,
  evaluationOutcome,
  evaluationSaveBlockers,
  evaluationStatus,
  exclusionBlockers,
  lifecycle,
  linkBlockers,
  nextStep,
  profileBlockers,
  raiseActionBlockers,
  taskCompletionBlockers,
  taskSaveBlockers,
  type EvaluationFacts,
  type EvaluationSaveInput,
  type SummaryItem,
} from "./workflow";

const TODAY = "2026-10-28";
const empty: EvaluationFacts = { isRelevant: true, relevanceNotes: "", evaluationNotes: "", ownerId: null, departmentId: null, nextReviewDate: null, reviewRequired: false };
const full: EvaluationFacts = {
  ...empty,
  relevanceNotes: "Forklift routes and barriers govern loading-bay movement",
  evaluationNotes: "Checked route plan, briefing and barrier inspection",
  ownerId: "sam",
  departmentId: "dep-cork",
  nextReviewDate: "2027-10-20",
};
const input = (e: EvaluationFacts, extra: Partial<EvaluationSaveInput> = {}): EvaluationSaveInput => ({ ...e, rating: null, confirmReviewed: false, ...extra });
const ctx = (e: EvaluationFacts) => ({ isRelevant: e.isRelevant, reviewRequired: e.reviewRequired, today: TODAY, currentNextReviewDate: null });

describe("L-02 partial and complete evaluation", () => {
  it("only the relevance narrative is Partly checked", () => {
    expect(evaluationStatus({ ...empty, relevanceNotes: full.relevanceNotes })).toBe("PARTIAL");
    expect(evaluationStatus(empty)).toBe("NOT_STARTED");
  });
  it("both narratives plus owner, department and next review = Checked", () => {
    expect(evaluationStatus(full)).toBe("COMPLETE");
  });
  it("both narratives without owner / department / review date are not checked, but can be saved", () => {
    const narratives = { ...full, ownerId: null, departmentId: null, nextReviewDate: null };
    expect(evaluationStatus(narratives)).toBe("PARTIAL");
    expect(evaluationSaveBlockers(input(narratives), ctx(narratives))).toEqual([]);
  });
  it("rejects a past review date unless it is unchanged, and malformed dates", () => {
    expect(evaluationSaveBlockers(input({ ...full, nextReviewDate: "2026-01-01" }), ctx(full))).toEqual(["The next review date cannot be in the past."]);
    expect(evaluationSaveBlockers(input({ ...full, nextReviewDate: "2026-01-01" }), { ...ctx(full), currentNextReviewDate: "2026-01-01" })).toEqual([]);
    expect(evaluationSaveBlockers(input({ ...full, nextReviewDate: "2026-13-01" }), ctx(full))).toEqual(["Choose a valid next review date."]);
  });
  it("records the evaluated date only when the check is complete", () => {
    expect(evaluationOutcome(input(full), { reviewRequired: false, evaluatedOn: null, today: TODAY }).evaluatedOn).toBe(TODAY);
    expect(evaluationOutcome(input({ ...full, evaluationNotes: "" }), { reviewRequired: false, evaluatedOn: "2026-01-02", today: TODAY }).evaluatedOn).toBe("2026-01-02");
  });
});

describe("L-03 rating is separate from completion", () => {
  const item = (rating: number | null, extra: Partial<SummaryItem> = {}): SummaryItem => ({ ...empty, inScope: true, rating, ...extra });

  it("averages only relevant rated items", () => {
    const s = complianceSummary([item(80), item(40), item(100, { isRelevant: false })], TODAY);
    expect(s).toMatchObject({ total: 2, rated: 2, score: 60, excluded: 1, complete: 0 });
  });
  it("cleared ratings show Not assessed (null), not 0 % or 100 %", () => {
    expect(complianceSummary([item(null), item(null), item(100, { isRelevant: false })], TODAY).score).toBeNull();
  });
  it("rounds to a whole percentage and leaves out-of-scope items out", () => {
    const s = complianceSummary([item(70), item(75), item(76), item(0, { inScope: false })], TODAY);
    expect(s.score).toBe(74);
    expect(s.outside).toBe(1);
  });
  it("whole numbers 0–100 only; empty clears", () => {
    expect(evaluationSaveBlockers(input(full, { rating: 101 }), ctx(full))).toEqual(["The rating must be a whole number from 0 to 100."]);
    expect(evaluationSaveBlockers(input(full, { rating: 55.5 }), ctx(full))).toEqual(["The rating must be a whole number from 0 to 100."]);
    expect(evaluationSaveBlockers(input(full, { rating: 0 }), ctx(full))).toEqual([]);
    expect(evaluationSaveBlockers(input(full, { rating: null }), ctx(full))).toEqual([]);
  });
  it("review attention counts content flags and overdue review dates", () => {
    const s = complianceSummary([item(null, { ...full, reviewRequired: true }), item(null, { ...full, nextReviewDate: "2026-10-01" }), item(null, full)], TODAY);
    expect(s.review).toBe(2);
    expect(s.complete).toBe(2);
  });
});

describe("L-04 exclude and restore", () => {
  it("needs a reason", () => {
    expect(exclusionBlockers("  ")).toEqual(["Explain why this requirement does not apply to us."]);
    expect(exclusionBlockers("This activity is no longer performed at this site")).toEqual([]);
  });
  it("a not-relevant item keeps its work and is offered 'applies again'", () => {
    const excluded = { ...full, isRelevant: false };
    expect(evaluationStatus(excluded)).toBe("NOT_RELEVANT");
    expect(evaluationStatus({ ...excluded, isRelevant: true })).toBe("COMPLETE");
    expect(nextStep("NOT_RELEVANT", { canEvaluate: true, reviewOverdue: false, inScope: true })).toBe("restore");
    expect(evaluationSaveBlockers(input(excluded), ctx(excluded))[0]).toMatch(/not applying/);
  });
});

describe("L-06 explicit content review", () => {
  const flagged = { ...full, reviewRequired: true };

  it("saving partial notes does not clear the flag", () => {
    const partial = input({ ...flagged, evaluationNotes: "" });
    expect(evaluationOutcome(partial, { reviewRequired: true, evaluatedOn: null, today: TODAY }).reviewRequired).toBe(true);
  });
  it("a complete evaluation without the confirmation keeps the flag", () => {
    expect(evaluationStatus(flagged)).toBe("REVIEW_REQUIRED");
    expect(evaluationOutcome(input(flagged), { reviewRequired: true, evaluatedOn: null, today: TODAY }).reviewRequired).toBe(true);
  });
  it("confirming needs a complete evaluation", () => {
    const incomplete = input({ ...flagged, ownerId: null }, { confirmReviewed: true });
    expect(evaluationSaveBlockers(incomplete, ctx(flagged))[0]).toMatch(/^To confirm the review, complete the check first: Choose who is responsible\./);
  });
  it("only the explicit confirmation on a complete evaluation clears it", () => {
    const out = evaluationOutcome(input(flagged, { confirmReviewed: true }), { reviewRequired: true, evaluatedOn: null, today: TODAY });
    expect(out).toEqual({ reviewRequired: false, evaluatedOn: TODAY, reviewConfirmed: true });
  });
});

describe("L-08 tasks", () => {
  it("completion needs a comment", () => {
    expect(taskCompletionBlockers({ status: "OPEN", archived: false, notes: "" })).toEqual(["Say what was done (completion comment)."]);
    expect(taskCompletionBlockers({ status: "OPEN", archived: false, notes: "Barriers inspected; one defect raised as an action" })).toEqual([]);
    expect(taskCompletionBlockers({ status: "COMPLETED", archived: false, notes: "x" })).toEqual(["This task is already done."]);
    expect(taskCompletionBlockers({ status: "OPEN", archived: true, notes: "x" })).toEqual(["Restore the task before completing it."]);
  });
  it("save needs description, owner, department and a valid due date", () => {
    expect(taskSaveBlockers({ title: "", ownerId: null, departmentId: null, dueDate: "2026-02-30", today: TODAY })).toEqual([
      "Describe the task.",
      "Choose who will do it.",
      "Choose the responsible department.",
      "Choose a valid due date.",
    ]);
    expect(taskSaveBlockers({ title: "Inspect route barriers", ownerId: "priya", departmentId: "d", dueDate: "2026-10-30", today: TODAY })).toEqual([]);
    expect(taskSaveBlockers({ title: "x", ownerId: "p", departmentId: "d", dueDate: "2026-10-01", today: TODAY })).toEqual(["The due date cannot be in the past."]);
    expect(taskSaveBlockers({ title: "x", ownerId: "p", departmentId: "d", dueDate: "2026-10-01", today: TODAY, currentDueDate: "2026-10-01" })).toEqual([]);
  });
});

describe("next step and stepper", () => {
  const opts = { canEvaluate: true, reviewOverdue: false, inScope: true };
  it("one primary button per state, none without the right or outside the profile", () => {
    expect(nextStep("NOT_STARTED", opts)).toBe("check");
    expect(nextStep("PARTIAL", opts)).toBe("finish");
    expect(nextStep("REVIEW_REQUIRED", opts)).toBe("review");
    expect(nextStep("COMPLETE", opts)).toBeNull();
    expect(nextStep("COMPLETE", { ...opts, reviewOverdue: true })).toBe("recheck");
    expect(nextStep("PARTIAL", { ...opts, canEvaluate: false })).toBeNull();
    expect(nextStep("PARTIAL", { ...opts, inScope: false })).toBeNull();
  });
  it("marks done steps and the first open one", () => {
    expect(lifecycle({ ...empty, relevanceNotes: "x" }).map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    expect(lifecycle(full).map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    expect(lifecycle({ ...full, reviewRequired: true }).at(-1)).toEqual({ key: "REVIEW", label: "Review the change", state: "current" });
    expect(lifecycle({ ...full, isRelevant: false })).toEqual([{ key: "NOT_RELEVANT", label: "Doesn't apply", state: "current" }]);
  });
});

describe("other gates", () => {
  it("profile needs name, owner, site, jurisdiction and an activity", () => {
    expect(profileBlockers({ name: "", ownerId: null, siteId: null, jurisdiction: "", activities: [] })).toHaveLength(5);
    expect(profileBlockers({ name: "Cork operations", ownerId: "sam", siteId: "cork", jurisdiction: "Ireland", activities: ["Waste"] })).toEqual([]);
  });
  it("links need a record and context", () => {
    expect(linkBlockers({ targetId: null, context: "" })).toHaveLength(2);
    expect(linkBlockers({ targetId: "ra", context: "Loading bay route conflict" })).toEqual([]);
  });
  it("L-10 corrective action needs description, owner, department and a valid due date", () => {
    expect(raiseActionBlockers({ description: "Repair route barrier", ownerId: "sam", departmentId: "d", dueDate: "2026-10-27", today: "2026-10-20" })).toEqual([]);
    expect(raiseActionBlockers({ description: "", ownerId: null, departmentId: null, dueDate: null, today: TODAY })).toHaveLength(4);
  });
});
