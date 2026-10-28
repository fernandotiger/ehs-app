/**
 * Law module – shared vocabulary and labels (client + server). Content packages and applicability:
 * ./content.ts. Evaluation / task rules: src/server/modules/law/workflow.ts.
 */
export * from "./content";

export const LAW_FORM_MODULE = "law";
export const LAW_FORM_PURPOSE = "LAW";

export const LAW_TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type LawTaskPriorityKey = (typeof LAW_TASK_PRIORITIES)[number];
export const LAW_TASK_PRIORITY_LABELS: Record<LawTaskPriorityKey, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

export const LAW_TASK_STATUSES = ["OPEN", "COMPLETED"] as const;
export type LawTaskStatusKey = (typeof LAW_TASK_STATUSES)[number];
export const LAW_TASK_STATUS_LABELS: Record<LawTaskStatusKey, string> = { OPEN: "To do", COMPLETED: "Done" };

/** Evaluation status of a requirement (derived; see workflow.ts evaluationStatus). */
export const EVALUATION_STATUSES = ["NOT_STARTED", "PARTIAL", "COMPLETE", "REVIEW_REQUIRED", "NOT_RELEVANT"] as const;
export type EvaluationStatusKey = (typeof EVALUATION_STATUSES)[number];
export const EVALUATION_STATUS_LABELS: Record<EvaluationStatusKey, string> = {
  NOT_STARTED: "Not checked",
  PARTIAL: "Partly checked",
  COMPLETE: "Checked",
  REVIEW_REQUIRED: "Law changed – review",
  NOT_RELEVANT: "Doesn't apply",
};
export const EVALUATION_STATUS_HINTS: Record<EvaluationStatusKey, string> = {
  NOT_STARTED: "Nobody has checked this requirement yet.",
  PARTIAL: "Some of the check is written down, but not all of it.",
  COMPLETE: "Why it applies, how we checked, who is responsible and the next review are recorded.",
  REVIEW_REQUIRED: "The requirement changed in a content update. Review your controls and evidence, then confirm.",
  NOT_RELEVANT: "Someone explained why this does not apply to us. Earlier work is kept.",
};

/** Which part of a profile's register to show. */
export const REQUIREMENT_VIEWS = ["applies", "not-relevant", "outside", "all"] as const;
export type RequirementView = (typeof REQUIREMENT_VIEWS)[number];
export const REQUIREMENT_VIEW_LABELS: Record<RequirementView, string> = {
  applies: "Applies to us",
  "not-relevant": "Doesn't apply",
  outside: "Outside this profile",
  all: "Everything",
};

/** Records a requirement can be linked to (explicit associations). */
export const LAW_LINK_TARGETS = ["RiskAssessment", "Incident", "CorrectiveAction"] as const;
export type LawLinkTarget = (typeof LAW_LINK_TARGETS)[number];
export const LAW_LINK_TARGET_LABELS: Record<LawLinkTarget, string> = {
  RiskAssessment: "Risk assessment",
  Incident: "Incident",
  CorrectiveAction: "Incident action",
};

/** Self-assessed rating bands: below 50, 50–79, 80–100 (self-assessment, not a legal conclusion). */
export type RatingBand = "low" | "medium" | "high";
export function ratingBand(rating: number): RatingBand {
  return rating >= 80 ? "high" : rating >= 50 ? "medium" : "low";
}
export const RATING_BAND_LABELS: Record<RatingBand, string> = { low: "Below 50%", medium: "50–79%", high: "80–100%" };

/** Open task with a due date before today (company-local). */
export function isLawTaskOverdue(status: LawTaskStatusKey, dueDate: string | null, today: string): boolean {
  return status === "OPEN" && Boolean(dueDate) && dueDate! < today;
}

/** Shown wherever compliance figures appear. */
export const LAW_DISCLAIMER = "This records your own assessment of each requirement. It is not legal advice and does not certify compliance.";
