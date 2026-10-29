import { describe, expect, it } from "vitest";
import { DEFAULT_STATUS_LABELS, statusLabels } from "./index";
import {
  actionAfterSave,
  actionCompleteBlockers,
  applicabilityBlockers,
  applicabilitySuggestion,
  isActionOverdue,
  jurisdictionBreakdown,
  lawProgress,
  moveInOrder,
  nameBlockers,
  needsRecheck,
  nextStep,
  overviewRoles,
  parseRoles,
  registerSteps,
  requirementBlockers,
  requirementCounts,
  type RequirementState,
} from "./rules";

const TODAY = "2026-10-28";

const empty: RequirementState = { compliance: "NOT_ASSESSED", reason: "", actionText: "", actionOwnerId: null, actionDueDate: null, actionStatus: "NONE" };
const open: RequirementState = { compliance: "NOT_COMPLIANT", reason: "Gap", actionText: "Join Repak", actionOwnerId: "u1", actionDueDate: "2026-11-30", actionStatus: "OPEN" };

describe("applicability (storyboard step 4)", () => {
  it("any Yes means likely applies", () => {
    expect(applicabilitySuggestion(["NO", null, "YES"])).toBe("LIKELY");
  });
  it("all No means probably not", () => {
    expect(applicabilitySuggestion(["NO", "NO"])).toBe("UNLIKELY");
  });
  it("unanswered or no questions means keep answering", () => {
    expect(applicabilitySuggestion(["NO", null])).toBe("UNKNOWN");
    expect(applicabilitySuggestion([])).toBe("UNKNOWN");
  });
  it("needs a reason for 'does not apply' and blocks repealed laws", () => {
    expect(applicabilityBlockers({ status: "ACTIVE", decision: "DOES_NOT_APPLY", reason: " " })).toHaveLength(1);
    expect(applicabilityBlockers({ status: "ACTIVE", decision: "DOES_NOT_APPLY", reason: "We sell no packaging" })).toEqual([]);
    expect(applicabilityBlockers({ status: "ACTIVE", decision: "APPLIES", reason: "" })).toEqual([]);
    expect(applicabilityBlockers({ status: "REPEALED", decision: "APPLIES", reason: "" })).toHaveLength(1);
  });
});

describe("requirement save gates (storyboard step 5)", () => {
  it("compliant needs a reason", () => {
    expect(requirementBlockers(empty, { ...empty, compliance: "COMPLIANT" }, TODAY)).toHaveLength(1);
    expect(requirementBlockers(empty, { ...empty, compliance: "COMPLIANT", reason: "Member of Repak" }, TODAY)).toEqual([]);
  });
  it("not compliant needs action, owner and due date", () => {
    expect(requirementBlockers(empty, { ...empty, compliance: "NOT_COMPLIANT" }, TODAY)).toHaveLength(3);
    expect(requirementBlockers(empty, { ...open }, TODAY)).toEqual([]);
  });
  it("a new or changed action cannot be due in the past, an unchanged overdue one can be saved", () => {
    const late = { ...open, actionDueDate: "2026-10-01" };
    expect(requirementBlockers(empty, late, TODAY)).toEqual(["The due date cannot be in the past."]);
    expect(requirementBlockers({ ...late }, { ...late, reason: "New note" }, TODAY)).toEqual([]);
  });
  it("N/A and not assessed save without anything else", () => {
    expect(requirementBlockers(open, { ...empty, compliance: "NOT_APPLICABLE" }, TODAY)).toEqual([]);
    expect(requirementBlockers(open, { ...empty }, TODAY)).toEqual([]);
  });
});

describe("action that follows a save", () => {
  it("not compliant opens the action and notifies", () => {
    expect(actionAfterSave(empty, open)).toEqual({ actionStatus: "OPEN", opened: true, closedNote: null });
  });
  it("re-saving an open action keeps it open; a new owner is notified", () => {
    expect(actionAfterSave(open, { ...open, reason: "x" })).toMatchObject({ actionStatus: "OPEN", opened: false });
    expect(actionAfterSave(open, { ...open, actionOwnerId: "u2" })).toMatchObject({ actionStatus: "OPEN", opened: true });
  });
  it("a done action stays done unless the action itself changes", () => {
    const done = { ...open, actionStatus: "DONE" as const };
    expect(actionAfterSave(done, { ...open, reason: "still a gap" }).actionStatus).toBe("DONE");
    expect(actionAfterSave(done, { ...open, actionText: "Second fix" })).toMatchObject({ actionStatus: "OPEN", opened: true });
  });
  it("leaving 'not compliant' closes an open action automatically", () => {
    const out = actionAfterSave(open, { ...open, compliance: "COMPLIANT", reason: "Fixed" });
    expect(out.actionStatus).toBe("DONE");
    expect(out.closedNote).toMatch(/Compliant/);
    expect(actionAfterSave(empty, { ...empty, compliance: "COMPLIANT", reason: "ok" }).actionStatus).toBe("NONE");
  });
  it("re-check flag, overdue and completion gates", () => {
    expect(needsRecheck("NOT_COMPLIANT", "DONE")).toBe(true);
    expect(needsRecheck("COMPLIANT", "DONE")).toBe(false);
    expect(isActionOverdue("OPEN", "2026-10-27", TODAY)).toBe(true);
    expect(isActionOverdue("OPEN", TODAY, TODAY)).toBe(false);
    expect(isActionOverdue("DONE", "2026-10-01", TODAY)).toBe(false);
    expect(actionCompleteBlockers({ actionStatus: "OPEN", note: "" })).toEqual(["Say what was done."]);
    expect(actionCompleteBlockers({ actionStatus: "DONE", note: "x" })).toHaveLength(1);
  });
});

describe("summaries and progress", () => {
  const rows = [
    { compliance: "COMPLIANT" as const, actionStatus: "NONE" as const },
    { compliance: "NOT_COMPLIANT" as const, actionStatus: "OPEN" as const },
    { compliance: "NOT_COMPLIANT" as const, actionStatus: "DONE" as const },
    { compliance: "NOT_ASSESSED" as const, actionStatus: "NONE" as const },
    { compliance: "NOT_APPLICABLE" as const, actionStatus: "DONE" as const },
  ];
  const counts = requirementCounts(rows);
  it("counts every answer", () => {
    expect(counts).toEqual({ total: 5, compliant: 1, notCompliant: 2, notAssessed: 1, notApplicable: 1, openActions: 1, recheck: 1 });
  });
  it("progress in plain words", () => {
    expect(lawProgress({ status: "REPEALED", applicability: "APPLIES", counts }).key).toBe("REPEALED");
    expect(lawProgress({ status: "ACTIVE", applicability: "NOT_CHECKED", counts }).key).toBe("NOT_CHECKED");
    expect(lawProgress({ status: "ACTIVE", applicability: "DOES_NOT_APPLY", counts }).key).toBe("DOES_NOT_APPLY");
    expect(lawProgress({ status: "ACTIVE", applicability: "APPLIES", counts }).label).toBe("Applies – 2 not compliant");
    const toAssess = requirementCounts([rows[0]!, rows[3]!]);
    expect(lawProgress({ status: "AFFECTED", applicability: "APPLIES", counts: toAssess }).label).toBe("Applies – 1 to check");
    expect(lawProgress({ status: "ACTIVE", applicability: "APPLIES", counts: requirementCounts([rows[0]!, rows[4]!]) }).key).toBe("COMPLIANT");
    expect(lawProgress({ status: "ACTIVE", applicability: "APPLIES", counts: requirementCounts([]) }).key).toBe("NO_REQUIREMENTS");
  });
  it("one next step for people who may check", () => {
    const none = requirementCounts([]);
    expect(nextStep({ status: "ACTIVE", applicability: "NOT_CHECKED", counts: none, canAssess: true })).toBe("applicability");
    expect(nextStep({ status: "ACTIVE", applicability: "NOT_CHECKED", counts: none, canAssess: false })).toBeNull();
    expect(nextStep({ status: "ACTIVE", applicability: "APPLIES", counts, canAssess: true })).toBe("requirements");
    expect(nextStep({ status: "REPEALED", applicability: "NOT_CHECKED", counts: none, canAssess: true })).toBeNull();
    expect(nextStep({ status: "ACTIVE", applicability: "DOES_NOT_APPLY", counts, canAssess: true })).toBeNull();
  });
  it("4-step bar", () => {
    expect(registerSteps("category").map((s) => s.state)).toEqual(["current", "todo", "todo", "todo"]);
    expect(registerSteps("legislation").map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    expect(registerSteps("law", { status: "ACTIVE", applicability: "NOT_CHECKED", counts }).map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
    expect(registerSteps("law", { status: "ACTIVE", applicability: "DOES_NOT_APPLY", counts }).map((s) => s.state)).toEqual(["done", "done", "done", "skipped"]);
    expect(registerSteps("law", { status: "ACTIVE", applicability: "APPLIES", counts }).map((s) => s.state)).toEqual(["done", "done", "done", "current"]);
    expect(registerSteps("law", { status: "REPEALED", applicability: "NOT_CHECKED", counts }).map((s) => s.state)).toEqual(["done", "done", "skipped", "skipped"]);
  });
});

describe("lists and labels", () => {
  it("overview columns are the roles in first-seen order", () => {
    expect(overviewRoles([{ appliesTo: ["Manufacturer", "Importer"] }, { appliesTo: ["importer", "Distributor"] }])).toEqual(["Manufacturer", "Importer", "Distributor"]);
    expect(parseRoles("Employer, employee;  Employer\nSelf-employed")).toEqual(["Employer", "employee", "Self-employed"]);
  });
  it("names must be unique and not empty", () => {
    expect(nameBlockers(" ", ["EU"], "jurisdiction")).toHaveLength(1);
    expect(nameBlockers("eu", ["EU"], "jurisdiction")).toHaveLength(1);
    expect(nameBlockers("eu", ["EU"], "jurisdiction", "EU")).toEqual([]);
    expect(nameBlockers("UK", ["EU"], "jurisdiction")).toEqual([]);
  });
  it("moves items within an order", () => {
    expect(moveInOrder(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "c", "down")).toEqual(["a", "b", "c"]);
  });
  it("jurisdiction breakdown and status wording", () => {
    expect(jurisdictionBreakdown({ Ireland: 12, EU: 8, UK: 0 })).toBe("12 Ireland, 8 EU");
    expect(statusLabels({ ACTIVE: " In force ", REPEALED: "" })).toEqual({ ...DEFAULT_STATUS_LABELS, ACTIVE: "In force" });
    expect(statusLabels(null)).toEqual(DEFAULT_STATUS_LABELS);
  });
});
