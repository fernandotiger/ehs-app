import { describe, expect, it } from "vitest";
import {
  commandBlockers,
  completionBlockers,
  draftBlockers,
  isReviewDue,
  isReviewOverdue,
  isScoringTask,
  isTaskOverdue,
  lifecycle,
  nextRevision,
  nextStep,
  relatedLinkBlockers,
  restoredStatus,
  reviewBlockers,
  submitBlockers,
  taskBlockers,
  type AssessmentFacts,
  type HazardFacts,
} from "./workflow";

const hazard = (patch: Partial<HazardFacts> = {}): HazardFacts => ({
  activity: "Loading",
  name: "Moving vehicles",
  consequence: "Serious injury",
  controls: "Trained drivers, marked routes",
  justification: "Daily exposure",
  likelihood: 4,
  severity: 5,
  ...patch,
});

const complete = (patch: Partial<AssessmentFacts> = {}): AssessmentFacts => ({
  title: "Forklift movement",
  description: "Assess pedestrian exposure during loading",
  departmentId: "dep-eng",
  departmentValid: true,
  ownerId: "sam",
  approverId: "alex",
  reviewDate: "2027-10-20",
  method: "5x5",
  domain: "HEALTH_SAFETY",
  hazards: [hazard(), hazard({ name: "Poor visibility", consequence: "Collision", controls: "Lighting and mirrors", likelihood: 2, severity: 3 })],
  missingAnswers: [],
  formAvailable: true,
  ...patch,
});

describe("R-02 draft and submission gates", () => {
  it("a title-only draft saves", () => {
    expect(draftBlockers({ title: "Forklift movement", formAvailable: true })).toEqual([]);
    expect(draftBlockers({ title: "  ", formAvailable: true })).toEqual(["Enter an assessment title."]);
  });
  it("submission names the missing scope and analysis information", () => {
    const blockers = submitBlockers(complete({ departmentId: null, hazards: [hazard({ controls: "", justification: "" })] }));
    expect(blockers).toContain("Choose the department.");
    expect(blockers).toContain("Hazard 1 (Moving vehicles) needs: current controls, scoring justification.");
  });
  it("a complete assessment has no blockers; missing values and answers are listed", () => {
    expect(submitBlockers(complete())).toEqual([]);
    const blockers = submitBlockers(complete({ hazards: [hazard({ severity: null })], missingAnswers: ["How often?"], approverId: null }));
    expect(blockers).toEqual(["Choose the approver.", "Hazard 1 (Moving vehicles) needs: severity (1–5).", "Answer the required questions: How often?."]);
    expect(submitBlockers(complete({ hazards: [] }))).toContain("Add at least one hazard.");
    expect(submitBlockers(complete({ domain: "ENVIRONMENT", hazards: [] }))).toContain("Add at least one aspect.");
  });
  it("a form restricted to Dublin cannot be used for a Cork department", () => {
    expect(draftBlockers({ title: "x", formAvailable: false, siteName: "Cork Distribution" })[0]).toMatch(/not available at Cork Distribution/);
    expect(submitBlockers(complete({ formAvailable: false, siteName: "Cork Distribution" }))[0]).toMatch(/not available/);
  });
});

describe("R-01 / R-10 transitions", () => {
  it("submit only from Draft; approve from Draft (save & approve) or Awaiting approval", () => {
    expect(commandBlockers("DRAFT", "submit")).toEqual([]);
    expect(commandBlockers("AWAITING_APPROVAL", "submit")).toHaveLength(1);
    expect(commandBlockers("AWAITING_APPROVAL", "approve")).toEqual([]);
    expect(commandBlockers("APPROVED", "approve")).toHaveLength(1);
  });
  it("approval increments the revision", () => {
    expect(nextRevision(0)).toBe(1);
    expect(nextRevision(1)).toBe(2);
  });
  it("an Approved assessment must start a revision before edits; restore returns to Draft", () => {
    expect(commandBlockers("APPROVED", "save")[0]).toMatch(/Start a revision/);
    expect(commandBlockers("APPROVED", "revise")).toEqual([]);
    expect(commandBlockers("DRAFT", "revise")).toHaveLength(1);
    expect(commandBlockers("ARCHIVED", "restore")).toEqual([]);
    expect(commandBlockers("APPROVED", "restore")).toHaveLength(1);
    expect(restoredStatus()).toBe("DRAFT");
  });
  it("one primary next step per state", () => {
    const all = { edit: true, approve: true, review: true, archive: true };
    expect(nextStep("DRAFT", all)).toBe("SUBMIT");
    expect(nextStep("AWAITING_APPROVAL", all)).toBe("APPROVE");
    expect(nextStep("AWAITING_APPROVAL", { ...all, approve: false })).toBeNull();
    expect(nextStep("APPROVED", all)).toBe("RECORD_REVIEW");
    expect(nextStep("APPROVED", { ...all, review: false })).toBe("START_REVISION");
    expect(nextStep("ARCHIVED", all)).toBe("RESTORE");
  });
  it("lifecycle marks the current stage", () => {
    expect(lifecycle("AWAITING_APPROVAL", 0).map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    expect(lifecycle("APPROVED", 2)[2]!.label).toBe("Approved · revision 2");
  });
});

describe("R-09 periodic review", () => {
  const base = { status: "APPROVED" as const, reviewDate: "2026-10-20", nextReviewDate: "2027-10-20", comment: "Controls checked; assessment remains valid", today: "2026-10-20" };
  it("accepts today or earlier with a comment and a later next date", () => {
    expect(reviewBlockers(base)).toEqual([]);
  });
  it("rejects a future review date, an empty comment, an earlier next date and non-Approved assessments", () => {
    expect(reviewBlockers({ ...base, reviewDate: "2026-10-21", nextReviewDate: "2027-01-01" })).toEqual(["The review date cannot be in the future."]);
    expect(reviewBlockers({ ...base, comment: " " })).toEqual(["Enter a review comment."]);
    expect(reviewBlockers({ ...base, nextReviewDate: "2026-10-19" })).toEqual(["The next review date cannot be before the review date."]);
    expect(reviewBlockers({ ...base, status: "DRAFT" })[0]).toMatch(/only available for Approved/);
  });
  it("due and overdue reviews follow the company date and notice days", () => {
    expect(isReviewOverdue("APPROVED", "2026-10-19", "2026-10-20")).toBe(true);
    expect(isReviewOverdue("DRAFT", "2026-10-19", "2026-10-20")).toBe(false);
    expect(isReviewDue("APPROVED", "2026-11-01", 14, "2026-10-20")).toBe(true);
    expect(isReviewDue("APPROVED", "2026-11-05", 14, "2026-10-20")).toBe(false);
  });
});

describe("related assessments", () => {
  it("stay within one site", () => {
    expect(relatedLinkBlockers({ id: "a", siteId: "dub" }, { id: "b", siteId: "dub" })).toEqual([]);
    expect(relatedLinkBlockers({ id: "a", siteId: "dub" }, { id: "b", siteId: "crk" })).toEqual(["Only assessments at the same site can be related."]);
    expect(relatedLinkBlockers({ id: "a", siteId: "dub" }, { id: "a", siteId: "dub" })).toHaveLength(1);
  });
});

describe("R-07 task creation", () => {
  const mp = { kind: "MP" as const, title: "Run a refresher briefing", ownerId: "priya", createdOn: "2026-10-20", dueDate: "2026-10-19", programmeId: null, assessmentId: null, hazardId: null };
  it("blocks a missing programme and reversed dates", () => {
    expect(taskBlockers(mp)).toEqual(["The due date cannot be before the creation date.", "Choose a management programme – every task belongs to one."]);
  });
  it("saves with a programme and a later due date", () => {
    expect(taskBlockers({ ...mp, programmeId: "mp-1", dueDate: "2026-10-30" })).toEqual([]);
  });
  it("RA tasks need an assessment and a hazard; completed parents take no sub-tasks", () => {
    expect(taskBlockers({ ...mp, kind: "RA", programmeId: "mp-1", dueDate: "2026-10-30" })).toEqual(["Choose the assessment and the hazard / aspect this task improves."]);
    expect(taskBlockers({ ...mp, programmeId: "mp-1", dueDate: "2026-10-30", parentStatus: "COMPLETED" })).toHaveLength(1);
  });
});

describe("R-06 task completion and rescoring", () => {
  const parent = {
    status: "IN_PROGRESS" as const,
    openSubTasks: 1,
    comment: "Barrier installed and checked",
    completedOn: "2026-10-20",
    createdOn: "2026-09-15",
    today: "2026-10-20",
    scoring: true,
    assessmentStatus: "APPROVED" as const,
    actualValue: 2,
    factorRange: { label: "Likelihood", min: 1, max: 5 },
  };
  it("the parent is blocked by an open sub-task", () => {
    expect(completionBlockers(parent)).toEqual(["Complete every sub-task first (1 still open)."]);
    expect(completionBlockers({ ...parent, openSubTasks: 0 })).toEqual([]);
  });
  it("needs a comment and a date between creation and today", () => {
    const b = completionBlockers({ ...parent, openSubTasks: 0, comment: "", completedOn: "2026-10-21" });
    expect(b).toEqual(["Enter a completion comment.", "Choose a completion date between the creation date and today."]);
    expect(completionBlockers({ ...parent, openSubTasks: 0, completedOn: "2026-09-14" })).toHaveLength(1);
  });
  it("a scoring task waits for an Approved assessment and a valid achieved value", () => {
    expect(completionBlockers({ ...parent, openSubTasks: 0, assessmentStatus: "DRAFT" })[0]).toMatch(/Approve the current assessment revision/);
    expect(completionBlockers({ ...parent, openSubTasks: 0, actualValue: 9 })).toEqual(["Enter the achieved likelihood (1–5)."]);
    expect(completionBlockers({ ...parent, openSubTasks: 0, scoring: false, actualValue: null, assessmentStatus: null })).toEqual([]);
  });
  it("only top-level RA tasks with a factor rescore; sub-tasks never do", () => {
    expect(isScoringTask({ kind: "RA", parentId: null, factor: "likelihood" })).toBe(true);
    expect(isScoringTask({ kind: "RA", parentId: "rt-208", factor: "likelihood" })).toBe(false);
    expect(isScoringTask({ kind: "MP", parentId: null, factor: null })).toBe(false);
    expect(isTaskOverdue("OPEN", "2026-10-19", "2026-10-20")).toBe(true);
    expect(isTaskOverdue("COMPLETED", "2026-10-19", "2026-10-20")).toBe(false);
  });
});
