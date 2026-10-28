import { describe, expect, it } from "vitest";
import { isActionOverdue } from "@/lib/actions";
import { cancelBlockers, canTransition, commandBlockers, completionBlockers, lifecycle, nextStep, saveBlockers, transitionSources, transitionTarget } from "./workflow";

const TODAY = "2026-10-28";

describe("transitions", () => {
  it("start only from To do", () => {
    expect(canTransition("OPEN", "start")).toBe(true);
    expect(canTransition("IN_PROGRESS", "start")).toBe(false);
    expect(transitionTarget("start")).toBe("IN_PROGRESS");
  });
  it("complete and cancel from open work only", () => {
    for (const command of ["complete", "cancel"] as const) {
      expect(transitionSources(command)).toEqual(["OPEN", "IN_PROGRESS"]);
      expect(canTransition("COMPLETED", command)).toBe(false);
      expect(canTransition("CANCELLED", command)).toBe(false);
    }
  });
  it("reopen brings a finished action back to To do", () => {
    expect(canTransition("COMPLETED", "reopen")).toBe(true);
    expect(canTransition("CANCELLED", "reopen")).toBe(true);
    expect(canTransition("OPEN", "reopen")).toBe(false);
    expect(transitionTarget("reopen")).toBe("OPEN");
  });
  it("explains a refused command in plain words", () => {
    expect(commandBlockers("COMPLETED", "start")).toEqual(["Only an action that is to do can be started (it is completed)."]);
    expect(commandBlockers("OPEN", "start")).toEqual([]);
  });
});

describe("save gates", () => {
  const base = { title: "Fix the gate latch", ownerId: "u1", dueDate: "2026-11-05", today: TODAY };
  it("accepts a complete action", () => {
    expect(saveBlockers(base)).toEqual([]);
  });
  it("lists every missing field", () => {
    expect(saveBlockers({ ...base, title: " ", ownerId: null, dueDate: null })).toEqual([
      "Enter a title – what needs to be done.",
      "Choose who will do it.",
      "Choose a due date.",
    ]);
  });
  it("refuses a past due date on create and a too long title", () => {
    expect(saveBlockers({ ...base, dueDate: "2026-10-27" })).toEqual(["The due date cannot be in the past."]);
    expect(saveBlockers({ ...base, dueDate: TODAY })).toEqual([]);
    expect(saveBlockers({ ...base, title: "x".repeat(201) })).toEqual(["Keep the title to 200 characters."]);
  });
  it("on edit, keeps an unchanged past due date but refuses one before creation", () => {
    const edit = { ...base, createdOn: "2026-10-01", currentDueDate: "2026-10-10" };
    expect(saveBlockers({ ...edit, dueDate: "2026-10-10" })).toEqual([]);
    expect(saveBlockers({ ...edit, dueDate: "2026-10-05" })).toEqual([]);
    expect(saveBlockers({ ...edit, dueDate: "2026-09-30" })).toEqual(["The due date cannot be before the day the action was created."]);
  });
});

describe("completion and cancellation", () => {
  const base = { status: "IN_PROGRESS" as const, notes: "Latch replaced", completedOn: TODAY, createdOn: "2026-10-20", today: TODAY };
  it("needs notes and a date between creation and today", () => {
    expect(completionBlockers(base)).toEqual([]);
    expect(completionBlockers({ ...base, status: "OPEN" })).toEqual([]);
    expect(completionBlockers({ ...base, notes: "", completedOn: null })).toEqual(["Say what was done.", "Enter the date it was done."]);
    expect(completionBlockers({ ...base, completedOn: "2026-10-29" })).toEqual(["The completion date cannot be in the future."]);
    expect(completionBlockers({ ...base, completedOn: "2026-10-19" })).toEqual(["The completion date cannot be before the action was created."]);
    expect(completionBlockers({ ...base, status: "COMPLETED" })).toEqual(["The action is already completed."]);
  });
  it("cancelling needs a reason", () => {
    expect(cancelBlockers({ status: "OPEN", reason: "Duplicate" })).toEqual([]);
    expect(cancelBlockers({ status: "OPEN", reason: " " })).toEqual(["Say why the action is cancelled."]);
    expect(cancelBlockers({ status: "CANCELLED", reason: "x" })).toEqual(["The action is already cancelled."]);
  });
});

describe("next step and stepper", () => {
  it("offers ONE primary step for the person's rights", () => {
    expect(nextStep("OPEN", { work: true, reopen: false })).toBe("start");
    expect(nextStep("IN_PROGRESS", { work: true, reopen: false })).toBe("complete");
    expect(nextStep("IN_PROGRESS", { work: false, reopen: true })).toBeNull();
    expect(nextStep("COMPLETED", { work: false, reopen: true })).toBe("reopen");
    expect(nextStep("CANCELLED", { work: true, reopen: false })).toBeNull();
  });
  it("shows To do → In progress → Completed", () => {
    expect(lifecycle("OPEN", false).map((s) => `${s.label}:${s.state}`)).toEqual(["To do:current", "In progress:todo", "Completed:todo"]);
    expect(lifecycle("IN_PROGRESS", true).map((s) => s.state)).toEqual(["done", "current", "todo"]);
    expect(lifecycle("COMPLETED", true).map((s) => s.state)).toEqual(["done", "done", "done"]);
  });
  it("a cancelled action ends with Cancelled (In progress only when it was started)", () => {
    expect(lifecycle("CANCELLED", false).map((s) => s.label)).toEqual(["To do", "Cancelled"]);
    expect(lifecycle("CANCELLED", true).map((s) => s.label)).toEqual(["To do", "In progress", "Cancelled"]);
  });
});

describe("overdue", () => {
  it("is open work due before today", () => {
    expect(isActionOverdue("OPEN", "2026-10-27", TODAY)).toBe(true);
    expect(isActionOverdue("IN_PROGRESS", TODAY, TODAY)).toBe(false);
    expect(isActionOverdue("COMPLETED", "2026-10-01", TODAY)).toBe(false);
    expect(isActionOverdue("CANCELLED", "2026-10-01", TODAY)).toBe(false);
  });
});
