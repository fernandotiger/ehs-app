import type { BadgeTone } from "@/components/common/status-badge";
import { formatDate } from "@/features/incidents/format";
import { EVALUATION_STATUS_LABELS, LAW_TASK_PRIORITY_LABELS, type EvaluationStatusKey, type LawTaskPriorityKey, type RatingBand } from "@/lib/law";

/** Presentation helpers for the Law module. */

export { addDaysLocal, blockersOf, formatDate, formatDateTime, todayLocal } from "@/features/incidents/format";

export const EVALUATION_STATUS_TONES: Record<EvaluationStatusKey, BadgeTone> = {
  NOT_STARTED: "neutral",
  PARTIAL: "info",
  COMPLETE: "success",
  REVIEW_REQUIRED: "warning",
  NOT_RELEVANT: "neutral",
};

export const RATING_TONES: Record<RatingBand, BadgeTone> = { low: "danger", medium: "warning", high: "success" };
export const LAW_PRIORITY_TONES: Record<LawTaskPriorityKey, BadgeTone> = { LOW: "neutral", MEDIUM: "info", HIGH: "warning" };

export const LAW_HISTORY_LABELS: Record<string, string> = {
  LAW_PROFILE_CREATED: "Profile created",
  LAW_PROFILE_UPDATED: "Profile changed",
  LAW_PROFILE_ARCHIVED: "Profile archived",
  LAW_PROFILE_RESTORED: "Profile restored",
  LAW_PROFILE_CONTENT_ACCEPTED: "Legal content update accepted",
  LAW_REQUIREMENT_ADDED: "Company requirement added",
  LAW_REQUIREMENT_UPDATED: "Company requirement changed",
  LAW_REQUIREMENT_ARCHIVED: "Company requirement archived",
  LAW_REQUIREMENT_RESTORED: "Company requirement restored",
  LAW_REQUIREMENT_CONTENT_CHANGED: "The law changed – review needed",
  LAW_EVALUATION_SAVED: "Check saved",
  LAW_REVIEW_CONFIRMED: "Review confirmed",
  LAW_REQUIREMENT_EXCLUDED: "Marked as not applying",
  LAW_REQUIREMENT_INCLUDED: "Marked as applying again",
  LAW_RECORD_LINKED: "Record linked",
  LAW_RECORD_UNLINKED: "Link removed",
  LAW_INCIDENT_RAISED: "Non Compliance incident raised",
  LAW_ACTION_RAISED: "Corrective action raised",
  LAW_TASK_CREATED: "Task created",
  LAW_TASK_UPDATED: "Task changed",
  LAW_TASK_COMPLETED: "Task done",
  LAW_TASK_ARCHIVED: "Task archived",
  LAW_TASK_RESTORED: "Task restored",
  EVIDENCE_ADDED: "Evidence added",
  EVIDENCE_REMOVED: "Evidence removed",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  ownerId: "Responsible",
  jurisdiction: "Jurisdiction",
  activities: "Activities",
  isShared: "Shared with everyone",
  showRating: "Show the rating",
  contentVersion: "Legal content version",
  relevanceNotes: "Why it applies",
  evaluationNotes: "How we checked",
  rating: "Rating",
  departmentId: "Department",
  nextReviewDate: "Next review",
  isRelevant: "Applies to us",
  reviewRequired: "Review needed",
  title: "Title",
  requirementText: "Requirement",
  category: "Category",
  keywords: "Keywords",
  details: "Details",
  priority: "Priority",
  dueDate: "Due date",
  status: "Status",
  answers: "Answers to the extra questions",
};

function show(field: string, value: unknown, names: (id: string) => string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (field === "priority" && typeof value === "string") return LAW_TASK_PRIORITY_LABELS[value as LawTaskPriorityKey] ?? value;
  if (field === "rating") return `${String(value)}%`;
  if ((field === "ownerId" || field === "departmentId") && typeof value === "string") return names(value) ?? "someone else";
  if ((field === "dueDate" || field === "nextReviewDate") && typeof value === "string") return formatDate(value);
  if (typeof value === "string") return value.length > 90 ? `${value.slice(0, 90)}…` : value;
  return String(value);
}

/** Plain-words lines for an audit entry's `changes`. */
export function describeChanges(changes: unknown, names: (id: string) => string | null = () => null): string[] {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  const out: string[] = [];
  for (const [field, raw] of Object.entries(changes as Record<string, unknown>)) {
    const label = FIELD_LABELS[field];
    if (!label) continue;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && "from" in raw && "to" in raw) {
      const { from, to } = raw as { from: unknown; to: unknown };
      out.push(`${label}: ${show(field, from, names)} → ${show(field, to, names)}`);
    } else if (field === "answers") out.push(`${label} changed`);
    else out.push(`${label}: ${show(field, raw, names)}`);
  }
  return out;
}

export function statusLabel(status: EvaluationStatusKey): string {
  return EVALUATION_STATUS_LABELS[status];
}

export function dueLabel(date: string | null): string {
  return date ? formatDate(date) : "Not scheduled";
}

/** Remembered profile choice across the Law pages (per browser; the URL wins). */
const PROFILE_KEY = "oleoq.law.profile";
export function rememberedProfile(): string | null {
  try {
    return window.localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
}
export function rememberProfile(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(PROFILE_KEY, id);
  } catch {
    /* storage unavailable – the URL still carries the choice */
  }
}
