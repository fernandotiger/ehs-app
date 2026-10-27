/**
 * Objectives → targets → management programmes: validation and progress maths (pure, tested in
 * strategy.test.ts, example R-08). Safe for client components.
 *
 *  - Target progress = rounded % of movement from baseline toward goal, clamped to 0–100.
 *  - Completing a target requires reaching the goal (Increase: current ≥ goal; Decrease: ≤ goal).
 *  - Programme progress = completed linked tasks / all linked tasks (0 when none).
 *  - Completing a programme requires every linked task Completed. Objective completion stays an
 *    explicit status choice (no automatic gate).
 */
import type { ProgrammeStatus, StrategyStatus, TargetDirection, TaskStatus } from "@/lib/risk/labels";

const blank = (v: string | null | undefined) => !v || !v.trim();

export interface TargetNumbers {
  direction: TargetDirection;
  baseline: number;
  current: number;
  goal: number;
}

export function targetProgress(t: TargetNumbers): number {
  if (t.goal === t.baseline) return t.current === t.goal ? 100 : 0;
  const raw = Math.round(((t.current - t.baseline) / (t.goal - t.baseline)) * 100);
  return Math.max(0, Math.min(100, raw));
}

export function goalReached(t: TargetNumbers): boolean {
  return t.direction === "INCREASE" ? t.current >= t.goal : t.current <= t.goal;
}

/** An Increase goal must exceed the baseline; a Decrease goal must be below it. */
export function goalDirectionError(t: Pick<TargetNumbers, "direction" | "baseline" | "goal">): string | null {
  if (t.direction === "INCREASE" && !(t.goal > t.baseline)) return "For an increase, the goal must be above the baseline.";
  if (t.direction === "DECREASE" && !(t.goal < t.baseline)) return "For a decrease, the goal must be below the baseline.";
  return null;
}

export interface ObjectiveFacts {
  title: string;
  ownerId: string | null;
  deadline: string | null;
  departmentId: string | null;
}

export function objectiveBlockers(o: ObjectiveFacts): string[] {
  const out: string[] = [];
  if (blank(o.title)) out.push("Enter the objective title.");
  if (!o.departmentId) out.push("Choose the department.");
  if (!o.ownerId) out.push("Choose the owner.");
  if (!o.deadline) out.push("Set the deadline.");
  return out;
}

export interface TargetFacts extends TargetNumbers {
  title: string;
  objectiveId: string | null;
  ownerId: string | null;
  deadline: string | null;
  unit: string | null;
  status: StrategyStatus;
}

export function targetBlockers(t: TargetFacts): string[] {
  const out: string[] = [];
  if (blank(t.title)) out.push("Enter the target title.");
  if (!t.objectiveId) out.push("Choose the objective this target measures – a target must have an objective.");
  if (!t.ownerId) out.push("Choose the owner.");
  if (!t.deadline) out.push("Set the deadline.");
  if (blank(t.unit)) out.push("Choose the unit.");
  if (![t.baseline, t.current, t.goal].every(Number.isFinite)) out.push("Enter numbers for the baseline, current measurement and goal.");
  else {
    const direction = goalDirectionError(t);
    if (direction) out.push(direction);
    if (t.status === "COMPLETED" && !goalReached(t)) out.push("Record a current measurement that reaches the goal before completing this target.");
  }
  return out;
}

export interface ProgrammeFacts {
  title: string;
  objectiveId: string | null;
  targetIds: string[];
  /** Target ids that belong to the chosen objective. */
  objectiveTargetIds: string[];
  departmentId: string | null;
  ownerId: string | null;
  startDate: string | null;
  deadline: string | null;
  budget: number | null;
  status: ProgrammeStatus;
  /** Statuses of every task linked to the programme (sub-tasks included). */
  taskStatuses: TaskStatus[];
}

export function programmeBlockers(p: ProgrammeFacts): string[] {
  const out: string[] = [];
  if (blank(p.title)) out.push("Enter the programme title.");
  if (!p.objectiveId) out.push("Choose the objective.");
  if (!p.targetIds.length) out.push("Link at least one measurable target to this programme.");
  else if (p.targetIds.some((id) => !p.objectiveTargetIds.includes(id))) out.push("Linked targets must belong to the programme's objective.");
  if (!p.departmentId) out.push("Choose the department.");
  if (!p.ownerId) out.push("Choose the owner.");
  if (!p.startDate) out.push("Set the start date.");
  if (!p.deadline) out.push("Set the deadline.");
  if (p.startDate && p.deadline && p.deadline < p.startDate) out.push("The deadline cannot be before the start date.");
  if (p.budget !== null && (!Number.isFinite(p.budget) || p.budget < 0)) out.push("The budget cannot be negative.");
  if (p.status === "COMPLETED") out.push(...programmeCompletionBlockers(p.taskStatuses));
  return out;
}

export function programmeCompletionBlockers(taskStatuses: readonly TaskStatus[]): string[] {
  const open = taskStatuses.filter((s) => s !== "COMPLETED").length;
  return open ? [`Complete all linked tasks before completing the programme (${open} still open).`] : [];
}

/** Completed linked tasks / all linked tasks, rounded % (0 when none). */
export function programmeProgress(taskStatuses: readonly TaskStatus[]): number {
  if (!taskStatuses.length) return 0;
  return Math.round((taskStatuses.filter((s) => s === "COMPLETED").length / taskStatuses.length) * 100);
}

export function isPastDeadline(deadline: string, status: string, today: string): boolean {
  return status !== "COMPLETED" && deadline < today;
}
