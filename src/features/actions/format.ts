import type { BadgeTone } from "@/components/common/status-badge";
import { formatDate } from "@/features/incidents/format";
import { ACTION_PRIORITY_LABELS, ACTION_STATUS_LABELS, type ActionPriorityKey, type ActionStatusKey } from "@/lib/actions";

/** Presentation helpers for the Actions module. */

export { addDaysLocal, blockersOf, formatDate, formatDateTime, todayLocal } from "@/features/incidents/format";

export const ACTION_STATUS_TONES: Record<ActionStatusKey, BadgeTone> = { OPEN: "info", IN_PROGRESS: "brand", COMPLETED: "success", CANCELLED: "neutral" };
export const ACTION_PRIORITY_TONES: Record<ActionPriorityKey, BadgeTone> = { LOW: "neutral", NORMAL: "neutral", HIGH: "warning", URGENT: "danger" };

export const ACTION_HISTORY_LABELS: Record<string, string> = {
  ACTION_CREATED: "Action created",
  ACTION_UPDATED: "Action changed",
  ACTION_STARTED: "Work started",
  ACTION_COMPLETED: "Action completed",
  ACTION_CANCELLED: "Action cancelled",
  ACTION_REOPENED: "Action reopened",
  EVIDENCE_ADDED: "Evidence added",
  EVIDENCE_REMOVED: "Evidence removed",
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  priority: "Priority",
  ownerId: "Who does it",
  dueDate: "Due date",
  departmentId: "Department",
  status: "Status",
  completedOn: "Done on",
  answers: "Answers to the extra questions",
};

function show(field: string, value: unknown, names: (id: string) => string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "priority" && typeof value === "string") return ACTION_PRIORITY_LABELS[value as ActionPriorityKey] ?? value;
  if (field === "status" && typeof value === "string") return ACTION_STATUS_LABELS[value as ActionStatusKey] ?? value;
  if ((field === "ownerId" || field === "departmentId") && typeof value === "string") return names(value) ?? "someone else";
  if (field === "description" && typeof value === "string") return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  if ((field === "dueDate" || field === "completedOn") && typeof value === "string") return formatDate(value);
  return String(value);
}

/**
 * Plain-words lines for an audit entry's `changes` ({ field: { from, to } } or { field: value }).
 * Ids (people, departments) are shown by name when `names` knows them.
 */
export function describeChanges(changes: unknown, names: (id: string) => string | null = () => null): string[] {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  const out: string[] = [];
  for (const [field, raw] of Object.entries(changes as Record<string, unknown>)) {
    if (field === "reference") continue;
    const label = FIELD_LABELS[field];
    if (!label) continue;
    if (raw && typeof raw === "object" && "from" in raw && "to" in raw) {
      const { from, to } = raw as { from: unknown; to: unknown };
      out.push(`${label}: ${show(field, from, names)} → ${show(field, to, names)}`);
    } else if (field === "answers") {
      out.push(`${label} changed`);
    } else {
      out.push(`${label}: ${show(field, raw, names)}`);
    }
  }
  return out;
}
