/**
 * Standalone actions (Actions module) – shared vocabulary for client and server.
 * Lifecycle rules: src/server/modules/actions/workflow.ts.
 */

export const ACTION_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ActionStatusKey = (typeof ACTION_STATUSES)[number];
export const ACTION_STATUS_LABELS: Record<ActionStatusKey, string> = {
  OPEN: "To do",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Same values as the Incident action priorities (shared database enum `ActionPriority`). */
export const ACTION_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type ActionPriorityKey = (typeof ACTION_PRIORITIES)[number];
export const ACTION_PRIORITY_LABELS: Record<ActionPriorityKey, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };

/** Form Builder module/purpose of the extra questions shown on Create Action. */
export const ACTION_FORM_MODULE = "actions";
export const ACTION_FORM_PURPOSE = "ACTION";

/** Open work: not completed and not cancelled. */
export function isActiveStatus(status: ActionStatusKey): boolean {
  return status === "OPEN" || status === "IN_PROGRESS";
}

/** Overdue = open work whose due date (company-local yyyy-mm-dd) is before today. */
export function isActionOverdue(status: ActionStatusKey, dueDate: string, today: string): boolean {
  return isActiveStatus(status) && dueDate < today;
}
