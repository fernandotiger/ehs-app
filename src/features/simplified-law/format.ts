import type { BadgeTone } from "@/components/common/status-badge";
import { APPLICABILITY_LABELS, COMPLIANCE_LABELS, type ApplicabilityKey, type ComplianceKey, type LegalStatusKey } from "@/lib/simplified-law";
import type { ProgressKey } from "@/lib/simplified-law/rules";

/** Presentation helpers for the Simplified law module. */

export { formatDate, formatDateTime } from "@/features/documents/format";

export const STATUS_TONES: Record<LegalStatusKey, BadgeTone> = { ACTIVE: "success", AFFECTED: "info", SUPERSEDED: "warning", REPEALED: "neutral" };
export const PROGRESS_TONES: Record<ProgressKey, BadgeTone> = {
  REPEALED: "neutral",
  NOT_CHECKED: "warning",
  DOES_NOT_APPLY: "neutral",
  NO_REQUIREMENTS: "brand",
  NOT_COMPLIANT: "danger",
  TO_ASSESS: "info",
  COMPLIANT: "success",
};
export const COMPLIANCE_TONES: Record<ComplianceKey, BadgeTone> = { NOT_ASSESSED: "neutral", COMPLIANT: "success", NOT_COMPLIANT: "danger", NOT_APPLICABLE: "purple" };

/** Local yyyy-mm-dd, plus n days. */
export function todayPlus(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function blockersOf(error: unknown): string[] {
  const details = (error as { details?: unknown } | null)?.details as { blockers?: unknown } | undefined;
  return details && Array.isArray(details.blockers) ? details.blockers.map(String) : [];
}

export const STALE_MESSAGE = "Someone else changed this – reload to see their changes. Your input is kept.";

export const HISTORY_LABELS: Record<string, string> = {
  SLAW_APPLICABILITY_SAVED: "Applicability answered",
  SLAW_REQUIREMENT_ASSESSED: "Requirement checked",
  SLAW_ACTION_COMPLETED: "Action done",
  SLAW_ACTION_CLOSED: "Action closed automatically",
  SLAW_LEGISLATION_CREATED: "Law added",
  SLAW_LEGISLATION_UPDATED: "Law details changed",
  SLAW_LEGISLATION_ARCHIVED: "Law archived",
  SLAW_LEGISLATION_RESTORED: "Law restored",
  SLAW_CONTENT_CHANGED: "Content changed",
  EVIDENCE_ADDED: "Evidence added",
  EVIDENCE_REMOVED: "Evidence removed",
};

const FIELD_LABELS: Record<string, string> = {
  applicability: "Decision",
  applicabilityReason: "Reason",
  compliance: "Compliant?",
  reason: "Reason",
  actionText: "Action",
  actionOwnerId: "Owner",
  actionDueDate: "Due date",
  actionStatus: "Action",
  title: "Title",
  shortTitle: "Short name",
  reference: "Number / year",
  jurisdiction: "Jurisdiction",
  status: "Status",
  summary: "Summary",
  officialUrl: "Official document",
  guidanceUrl: "Guidance",
  categoryId: "Sub-category",
};

const ACTION_STATE: Record<string, string> = { NONE: "none", OPEN: "open", DONE: "done" };

function show(field: string, value: unknown, names: (id: string) => string | null, statusLabels: Record<string, string>): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "applicability") return APPLICABILITY_LABELS[value as ApplicabilityKey] ?? String(value);
  if (field === "compliance") return COMPLIANCE_LABELS[value as ComplianceKey] ?? String(value);
  if (field === "actionStatus") return ACTION_STATE[String(value)] ?? String(value);
  if (field === "status") return statusLabels[String(value)] ?? String(value);
  if (field === "actionDueDate" && typeof value === "string") return formatDateShort(value);
  if ((field === "actionOwnerId" || field === "categoryId") && typeof value === "string") return names(value) ?? "someone else";
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function formatDateShort(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

/** Plain-words lines for an audit entry's `changes` ({ field: { from, to } } or { field: value }). */
export function describeChanges(changes: unknown, statusLabels: Record<string, string>, names: (id: string) => string | null = () => null): string[] {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  const out: string[] = [];
  for (const [field, raw] of Object.entries(changes as Record<string, unknown>)) {
    const label = FIELD_LABELS[field];
    if (!label) continue;
    if (raw && typeof raw === "object" && "from" in raw && "to" in raw) {
      const { from, to } = raw as { from: unknown; to: unknown };
      out.push(`${label}: ${show(field, from, names, statusLabels)} → ${show(field, to, names, statusLabels)}`);
    } else {
      out.push(`${label}: ${show(field, raw, names, statusLabels)}`);
    }
  }
  return out;
}

/** People ids mentioned in `changes` (owners), to load their names. */
export function personIdsIn(changes: unknown): string[] {
  const owner = (changes as { actionOwnerId?: unknown } | null)?.actionOwnerId;
  if (typeof owner === "string") return [owner];
  if (owner && typeof owner === "object") return [(owner as { from?: unknown }).from, (owner as { to?: unknown }).to].filter((x): x is string => typeof x === "string");
  return [];
}
