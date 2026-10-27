/**
 * Incident module vocabulary shared by client and server (labels, fixed choices, export columns).
 * Lifecycle rules live in src/server/modules/incidents/workflow.ts (pure, unit-tested).
 */
import type { LookupListKey } from "./lookups";

export const SEVERITIES = ["MINOR", "MAJOR", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABELS: Record<Severity, string> = { MINOR: "Minor", MAJOR: "Major", CRITICAL: "Critical" };

export const INCIDENT_STATUSES = [
  "DRAFT",
  "OPEN",
  "INVESTIGATING",
  "ACTION_REQUIRED",
  "ACTION_IN_PROGRESS",
  "AWAITING_EFFECTIVENESS",
  "FOLLOW_UP_REQUIRED",
  "READY_TO_CLOSE",
  "CLOSED",
] as const;
export type IncidentStatusKey = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_STATUS_LABELS: Record<IncidentStatusKey, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  INVESTIGATING: "Investigating",
  ACTION_REQUIRED: "Action required",
  ACTION_IN_PROGRESS: "Action in progress",
  AWAITING_EFFECTIVENESS: "Awaiting effectiveness",
  FOLLOW_UP_REQUIRED: "Follow-up required",
  READY_TO_CLOSE: "Ready to close",
  CLOSED: "Closed",
};
/** Statuses that still need work (not Draft, not Closed). */
export const OPEN_INCIDENT_STATUSES: IncidentStatusKey[] = INCIDENT_STATUSES.filter((s) => s !== "DRAFT" && s !== "CLOSED");

export const INVESTIGATION_STATUSES = ["IN_PROGRESS", "COMPLETED"] as const;
export type InvestigationStatusKey = (typeof INVESTIGATION_STATUSES)[number];
export const INVESTIGATION_STATUS_LABELS: Record<InvestigationStatusKey, string> = { IN_PROGRESS: "In progress", COMPLETED: "Completed" };

export const ACTION_KINDS = ["CORRECTIVE", "PREVENTIVE"] as const;
export type ActionKindKey = (typeof ACTION_KINDS)[number];
export const ACTION_KIND_LABELS: Record<ActionKindKey, string> = { CORRECTIVE: "Corrective", PREVENTIVE: "Preventive" };

export const ACTION_STATES = ["OPEN", "IN_PROGRESS", "AWAITING_EFFECTIVENESS", "EFFECTIVE", "INEFFECTIVE"] as const;
export type ActionStateKey = (typeof ACTION_STATES)[number];
export const ACTION_STATE_LABELS: Record<ActionStateKey, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  AWAITING_EFFECTIVENESS: "Awaiting effectiveness",
  EFFECTIVE: "Effective",
  INEFFECTIVE: "Ineffective",
};

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type PriorityKey = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<PriorityKey, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };

export const PERSON_TYPES = ["EMPLOYEE", "TEMPORARY_WORKER", "CONTRACTOR", "VISITOR", "PUBLIC", "YOUNG_PERSON", "SUPPLIER"] as const;
export type PersonTypeKey = (typeof PERSON_TYPES)[number];
export const PERSON_TYPE_LABELS: Record<PersonTypeKey, string> = {
  EMPLOYEE: "Employee",
  TEMPORARY_WORKER: "Temporary worker",
  CONTRACTOR: "Contractor",
  VISITOR: "Visitor",
  PUBLIC: "Member of the public",
  YOUNG_PERSON: "Young person",
  SUPPLIER: "Supplier",
};

export const INVOLVEMENTS = ["INJURED", "WITNESS", "OTHER"] as const;
export type InvolvementKey = (typeof INVOLVEMENTS)[number];
export const INVOLVEMENT_LABELS: Record<InvolvementKey, string> = { INJURED: "Injured", WITNESS: "Witness", OTHER: "Other" };

export const DURATION_UNITS = ["MINUTES", "HOURS", "DAYS"] as const;
export type DurationUnitKey = (typeof DURATION_UNITS)[number];
export const DURATION_UNIT_LABELS: Record<DurationUnitKey, string> = { MINUTES: "Minutes", HOURS: "Hours", DAYS: "Days" };

/** The name to enter when a person's name is not known (an empty name is never accepted). */
export const UNKNOWN_PERSON = "Unknown";

// ── Causes and reportees (lookup lists) ─────────────────────────────────────

export const CAUSE_GROUPS = ["EQUIPMENT", "MATERIALS", "METHODS", "PEOPLE", "WORKPLACE"] as const;
export type CauseGroupKey = (typeof CAUSE_GROUPS)[number];
export const CAUSE_GROUP_LABELS: Record<CauseGroupKey, string> = {
  EQUIPMENT: "Equipment",
  MATERIALS: "Materials",
  METHODS: "Methods",
  PEOPLE: "People",
  WORKPLACE: "Workplace",
};
export const CAUSE_LISTS: Record<CauseGroupKey, LookupListKey> = {
  EQUIPMENT: "incident.cause.equipment",
  MATERIALS: "incident.cause.materials",
  METHODS: "incident.cause.methods",
  PEOPLE: "incident.cause.people",
  WORKPLACE: "incident.cause.workplace",
};

export const REPORTEE_KINDS = ["INTERNAL", "EXTERNAL"] as const;
export type ReporteeKindKey = (typeof REPORTEE_KINDS)[number];
export const REPORTEE_KIND_LABELS: Record<ReporteeKindKey, string> = { INTERNAL: "Internal", EXTERNAL: "External" };
export const REPORTEE_LISTS: Record<ReporteeKindKey, LookupListKey> = {
  INTERNAL: "incident.reportee.internal",
  EXTERNAL: "incident.reportee.external",
};

/** Absence kinds with this code (or named "Restricted duties") are excluded from days lost. */
export const RESTRICTED_DUTIES_CODE = "RESTRICTED";
export function isRestrictedKind(kind: { label: string; code?: string | null }): boolean {
  return kind.code?.toUpperCase() === RESTRICTED_DUTIES_CODE || kind.label.trim().toLowerCase() === "restricted duties";
}

// ── Export columns (Configuration → Incident settings) ──────────────────────

export const STANDARD_EXPORT_COLUMNS = {
  reference: "Reference",
  title: "Title",
  type: "Type",
  subtype: "Subtype",
  severity: "Severity",
  status: "Status",
  occurredAt: "Occurred",
  submittedAt: "Reported",
  reporter: "Reported by",
  site: "Site",
  location: "Location",
  department: "Department",
  preciseLocation: "Precise location",
  shift: "Shift",
  investigators: "Assigned investigators",
  targetDate: "Investigation target date",
  investigationStatus: "Investigation",
  causes: "Causes",
  daysLost: "Days lost",
  hoursLost: "Operating hours lost",
  actions: "Actions",
  confidential: "Confidential",
  closedAt: "Closed",
} as const;
export type StandardExportColumn = keyof typeof STANDARD_EXPORT_COLUMNS;

export const DEFAULT_EXPORT_COLUMNS: string[] = [
  "reference",
  "title",
  "type",
  "subtype",
  "severity",
  "occurredAt",
  "site",
  "department",
  "status",
  "investigators",
  "daysLost",
];

/** Custom-answer columns are stored as "answer:<questionKey>". */
export const ANSWER_COLUMN_PREFIX = "answer:";
export function answerColumn(key: string): string {
  return `${ANSWER_COLUMN_PREFIX}${key}`;
}
export function isStandardColumn(column: string): column is StandardExportColumn {
  return Object.prototype.hasOwnProperty.call(STANDARD_EXPORT_COLUMNS, column);
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** yyyy-mm-dd + n calendar days (UTC arithmetic on a date-only value). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive calendar days between two yyyy-mm-dd dates (0 when reversed). */
export function inclusiveDays(start: string, end: string): number {
  const a = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}
