import type { BadgeTone } from "@/components/common/status-badge";
import type { ActionStateKey, IncidentStatusKey, Severity } from "@/lib/incidents";

/** Presentation helpers for the Incident module. */

export { formatDate, formatDateTime } from "@/features/documents/format";

export const INCIDENT_STATUS_TONES: Record<IncidentStatusKey, BadgeTone> = {
  DRAFT: "neutral",
  OPEN: "info",
  INVESTIGATING: "purple",
  ACTION_REQUIRED: "warning",
  ACTION_IN_PROGRESS: "brand",
  AWAITING_EFFECTIVENESS: "info",
  FOLLOW_UP_REQUIRED: "danger",
  READY_TO_CLOSE: "success",
  CLOSED: "neutral",
};

export const ACTION_STATE_TONES: Record<ActionStateKey, BadgeTone> = {
  OPEN: "info",
  IN_PROGRESS: "brand",
  AWAITING_EFFECTIVENESS: "purple",
  EFFECTIVE: "success",
  INEFFECTIVE: "danger",
};

export const SEVERITY_TONES: Record<Severity, BadgeTone> = { MINOR: "neutral", MAJOR: "warning", CRITICAL: "danger" };

/** Local date (yyyy-mm-dd) of the browser – used for defaults; the server applies the company clock. */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysLocal(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO → value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO (browser time zone). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function placementLabel(p: { siteName: string | null; locationName?: string | null; departmentName: string | null }): string {
  return [p.siteName, p.locationName, p.departmentName].filter(Boolean).join(" · ") || "—";
}

export const HISTORY_LABELS: Record<string, string> = {
  INCIDENT_DRAFT_SAVED: "Draft saved",
  INCIDENT_REPORTED: "Incident reported",
  INCIDENT_SUBMITTED: "Report submitted",
  INCIDENT_UPDATED: "Report edited",
  INCIDENT_ARCHIVED: "Archived",
  INCIDENT_RESTORED: "Restored",
  INCIDENT_CLOSED: "Closed",
  INCIDENT_REOPENED: "Reopened",
  INVESTIGATION_STARTED: "Investigation started",
  INVESTIGATION_SAVED: "Investigation saved",
  INVESTIGATION_COMPLETED: "Investigation completed",
  INVESTIGATION_REOPENED: "Investigation reopened",
  ACTION_LINKED: "Action linked",
  ACTION_UNLINKED: "Action unlinked",
  EVIDENCE_ADDED: "Evidence added",
  EVIDENCE_REMOVED: "Evidence removed",
};

/** Message lines from a 422 business-rule error (details.blockers) or the error message. */
export function blockersOf(error: unknown): string[] {
  const details = (error as { details?: unknown } | null)?.details as { blockers?: unknown } | undefined;
  if (details && Array.isArray(details.blockers)) return details.blockers.map(String);
  return [];
}
