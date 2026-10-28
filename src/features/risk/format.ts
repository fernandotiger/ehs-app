import type { BadgeTone } from "@/components/common/status-badge";
import type { AssessmentStatus, ProgrammeStatus, StrategyStatus, TaskStatus } from "@/lib/risk/labels";
import type { RiskBand } from "@/lib/risk/scoring";

/** Presentation helpers for the Risk module. */

export { addDaysLocal, blockersOf, formatDate, formatDateTime, todayLocal } from "@/features/incidents/format";

export const ASSESSMENT_STATUS_TONES: Record<AssessmentStatus, BadgeTone> = {
  DRAFT: "neutral",
  AWAITING_APPROVAL: "purple",
  APPROVED: "success",
  ARCHIVED: "warning",
};

export const TASK_STATUS_TONES: Record<TaskStatus, BadgeTone> = { OPEN: "info", IN_PROGRESS: "brand", COMPLETED: "success" };
export const STRATEGY_STATUS_TONES: Record<StrategyStatus, BadgeTone> = { ACTIVE: "brand", COMPLETED: "success" };
export const PROGRAMME_STATUS_TONES: Record<ProgrammeStatus, BadgeTone> = { PLANNED: "neutral", ACTIVE: "brand", COMPLETED: "success" };

/** Band colours (risk colours keep their meaning: green → amber → orange → red). */
export const BAND_CLASSES: Record<RiskBand, string> = {
  LOW: "bg-success/15 text-success",
  SATISFACTORY: "bg-success/15 text-success",
  MEDIUM: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300",
  HIGH: "bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300",
  CRITICAL: "bg-destructive/15 text-destructive",
  ACTION_REQUIRED: "bg-destructive/15 text-destructive",
};

/** Solid heat-map cell colours. */
export const BAND_CELL: Record<RiskBand, string> = {
  LOW: "bg-success/25",
  SATISFACTORY: "bg-success/25",
  MEDIUM: "bg-amber-300/50 dark:bg-amber-400/30",
  HIGH: "bg-orange-400/50 dark:bg-orange-500/35",
  CRITICAL: "bg-destructive/45",
  ACTION_REQUIRED: "bg-destructive/45",
};

export const RISK_HISTORY_LABELS: Record<string, string> = {
  RISK_DRAFT_SAVED: "Draft saved",
  RISK_UPDATED: "Assessment edited",
  RISK_SUBMITTED: "Submitted for approval",
  RISK_APPROVED: "Approved",
  RISK_REVISION_STARTED: "Draft revision started",
  RISK_ARCHIVED: "Archived",
  RISK_RESTORED: "Restored as draft",
  RISK_CLONED: "Cloned",
  RISK_REVIEWED: "Periodic review recorded",
  RISK_RESCORED: "Rescored by a completed task",
  RISK_RELATED_LINKED: "Related assessment added",
  RISK_RELATED_UNLINKED: "Related assessment removed",
  RISK_ASSESSMENT_PDF_CREATED: "PDF created to save as a document",
  RISK_TASK_ADDED: "Task added",
  EVIDENCE_ADDED: "Evidence added",
  EVIDENCE_REMOVED: "Evidence removed",
};

export function placementLabel(p: { siteName: string | null; locationName?: string | null; departmentName: string | null }): string {
  return [p.siteName, p.departmentName].filter(Boolean).join(" · ") || "—";
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
