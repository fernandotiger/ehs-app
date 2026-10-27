import { describe, expect, it } from "vitest";
import { goalDirectionError, goalReached, objectiveBlockers, programmeBlockers, programmeCompletionBlockers, programmeProgress, targetBlockers, targetProgress, type ProgrammeFacts, type TargetFacts } from "./strategy";

const target = (patch: Partial<TargetFacts> = {}): TargetFacts => ({
  title: "Observation points on transport routes",
  objectiveId: "obj-1",
  ownerId: "sam",
  deadline: "2026-12-01",
  unit: "observation points",
  direction: "DECREASE",
  baseline: 100,
  current: 90,
  goal: 80,
  status: "ACTIVE",
  ...patch,
});

describe("R-08 measurable improvement", () => {
  it("Decrease 100 → 80 with current 90 is 50% progress", () => {
    expect(targetProgress(target())).toBe(50);
  });
  it("progress is clamped to 0–100 and works for increases", () => {
    expect(targetProgress(target({ current: 110 }))).toBe(0);
    expect(targetProgress(target({ current: 70 }))).toBe(100);
    expect(targetProgress({ direction: "INCREASE", baseline: 60, current: 82, goal: 100 })).toBe(55);
  });
  it("completing a target is blocked until the goal is reached", () => {
    expect(targetBlockers(target({ status: "COMPLETED" }))).toEqual(["Record a current measurement that reaches the goal before completing this target."]);
    expect(targetBlockers(target({ status: "COMPLETED", current: 80 }))).toEqual([]);
    expect(goalReached(target({ current: 79 }))).toBe(true);
  });
  it("a Decrease goal above the baseline is invalid (goal 120)", () => {
    expect(goalDirectionError({ direction: "DECREASE", baseline: 100, goal: 120 })).toMatch(/below the baseline/);
    expect(goalDirectionError({ direction: "INCREASE", baseline: 100, goal: 100 })).toMatch(/above the baseline/);
    expect(targetBlockers(target({ goal: 120 }))).toContain("For a decrease, the goal must be below the baseline.");
  });
  it("a target must have an objective", () => {
    expect(targetBlockers(target({ objectiveId: null }))[0]).toMatch(/must have an objective/);
  });
});

describe("programmes", () => {
  const programme = (patch: Partial<ProgrammeFacts> = {}): ProgrammeFacts => ({
    title: "Install segregation",
    objectiveId: "obj-1",
    targetIds: ["t-1"],
    objectiveTargetIds: ["t-1", "t-2"],
    departmentId: "dep-ops",
    ownerId: "sam",
    startDate: "2026-10-20",
    deadline: "2026-12-01",
    budget: 12000,
    status: "ACTIVE",
    taskStatuses: ["OPEN", "COMPLETED"],
    ...patch,
  });
  it("cannot be saved without a linked target; targets must belong to the objective", () => {
    expect(programmeBlockers(programme({ targetIds: [] }))).toEqual(["Link at least one measurable target to this programme."]);
    expect(programmeBlockers(programme({ targetIds: ["t-9"] }))).toEqual(["Linked targets must belong to the programme's objective."]);
  });
  it("deadline cannot precede the start", () => {
    expect(programmeBlockers(programme({ deadline: "2026-10-19" }))).toEqual(["The deadline cannot be before the start date."]);
  });
  it("completion is blocked while tasks remain open", () => {
    expect(programmeBlockers(programme({ status: "COMPLETED" }))).toEqual(["Complete all linked tasks before completing the programme (1 still open)."]);
    expect(programmeCompletionBlockers(["COMPLETED"])).toEqual([]);
  });
  it("progress = completed / all linked tasks, 0 without tasks", () => {
    expect(programmeProgress(["OPEN", "COMPLETED"])).toBe(50);
    expect(programmeProgress(["COMPLETED", "COMPLETED", "IN_PROGRESS"])).toBe(67);
    expect(programmeProgress([])).toBe(0);
  });
});

describe("objectives", () => {
  it("need title, department, owner and deadline", () => {
    expect(objectiveBlockers({ title: "", ownerId: null, deadline: null, departmentId: null })).toHaveLength(4);
    expect(objectiveBlockers({ title: "Reduce transport exposure", ownerId: "sam", deadline: "2026-12-31", departmentId: "d" })).toEqual([]);
  });
});
