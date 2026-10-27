/**
 * Risk module vocabulary shared by client and server (statuses, labels, fixed choices).
 * Lifecycle rules: src/server/modules/risk/workflow.ts; scoring maths: ./scoring.ts.
 */

export const ASSESSMENT_STATUSES = ["DRAFT", "AWAITING_APPROVAL", "APPROVED", "ARCHIVED"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];
export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};

export const REVISION_ACTIONS = ["APPROVED", "TASK_RESCORE"] as const;
export type RevisionAction = (typeof REVISION_ACTIONS)[number];
export const REVISION_ACTION_LABELS: Record<RevisionAction, string> = { APPROVED: "Approved", TASK_RESCORE: "Rescored by a task" };

export const CHECKLIST_RESULTS = ["YES", "NO", "NOT_APPLICABLE"] as const;
export type ChecklistResultKey = (typeof CHECKLIST_RESULTS)[number];
export const CHECKLIST_RESULT_LABELS: Record<ChecklistResultKey, string> = { YES: "Yes", NO: "No", NOT_APPLICABLE: "N/A" };

export const TARGET_DIRECTIONS = ["INCREASE", "DECREASE"] as const;
export type TargetDirection = (typeof TARGET_DIRECTIONS)[number];
export const TARGET_DIRECTION_LABELS: Record<TargetDirection, string> = { INCREASE: "Increase", DECREASE: "Decrease" };

export const STRATEGY_STATUSES = ["ACTIVE", "COMPLETED"] as const;
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number];
export const STRATEGY_STATUS_LABELS: Record<StrategyStatus, string> = { ACTIVE: "Active", COMPLETED: "Completed" };

export const PROGRAMME_STATUSES = ["PLANNED", "ACTIVE", "COMPLETED"] as const;
export type ProgrammeStatus = (typeof PROGRAMME_STATUSES)[number];
export const PROGRAMME_STATUS_LABELS: Record<ProgrammeStatus, string> = { PLANNED: "Planned", ACTIVE: "Active", COMPLETED: "Completed" };

export const TASK_KINDS = ["RA", "MP"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_KIND_LABELS: Record<TaskKind, string> = { RA: "Assessment task", MP: "Programme task" };
export const TASK_KIND_SHORT: Record<TaskKind, string> = { RA: "RA", MP: "MP" };

export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { OPEN: "Open", IN_PROGRESS: "In progress", COMPLETED: "Completed" };

/** Hazard (Health & Safety) or aspect (Environment) wording. */
export function hazardWord(domain: string, plural = false): string {
  const word = domain === "ENVIRONMENT" ? "aspect" : "hazard";
  return plural ? `${word}s` : word;
}

export function hazardWordTitle(domain: string, plural = false): string {
  const w = hazardWord(domain, plural);
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** yyyy-mm-dd + n calendar months (end-of-month clamped). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** yyyy-mm-dd + n calendar days. */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
