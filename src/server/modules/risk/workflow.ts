/**
 * Risk assessment and task lifecycle – pure state machine + guards (tested in workflow.test.ts,
 * examples R-01, R-02, R-06, R-07, R-09, R-10). Every guard returns plain-words lines; services
 * answer 422 BUSINESS_RULE_VIOLATION with `details.blockers`. Safe for client components.
 *
 * Assessment: Draft → Awaiting approval → Approved; any → Archived; Archived → Draft (restore).
 * Approval increments the revision and retains the score + hazard snapshot. Editing an Approved
 * assessment starts a Draft revision (the earlier approval stays in the history). A periodic
 * review moves the review date only (no rescoring, no revision change).
 */
import { addDaysIso, ASSESSMENT_STATUS_LABELS, hazardWord, type AssessmentStatus, type TaskKind, type TaskStatus } from "@/lib/risk/labels";
import type { RiskMethod } from "@/lib/risk/scoring";
import { methodValueIssues, type HazardValues } from "./scoring";

// ── Assessment gates ────────────────────────────────────────────────────────

export interface HazardFacts extends HazardValues {
  activity: string;
  name: string;
  consequence: string;
  controls: string;
  justification: string;
}

export interface AssessmentFacts {
  title: string;
  description: string | null;
  departmentId: string | null;
  /** The department exists in the company structure and is active. */
  departmentValid: boolean;
  ownerId: string | null;
  approverId: string | null;
  reviewDate: string | null;
  method: RiskMethod;
  domain: string;
  hazards: HazardFacts[];
  /** Labels of required custom questions without an answer (+ malformed answers). */
  missingAnswers: string[];
  /** The captured form is available at the department's site. */
  formAvailable: boolean;
  siteName?: string | null;
}

const blank = (v: string | null | undefined) => !v || !v.trim();

/** A draft only needs a title (and a template that may be used at the chosen site). */
export function draftBlockers(f: Pick<AssessmentFacts, "title" | "formAvailable" | "siteName">): string[] {
  const out: string[] = [];
  if (blank(f.title)) out.push("Enter an assessment title.");
  if (!f.formAvailable) out.push(`The chosen Risk form is not available at ${f.siteName ?? "the department's site"} – choose another department or form.`);
  return out;
}

/** What one hazard/aspect still needs (empty = complete). */
export function hazardGaps(h: HazardFacts, method: RiskMethod, domain: string): string[] {
  const gaps: string[] = [];
  if (blank(h.activity)) gaps.push("activity / job step");
  if (blank(h.name)) gaps.push(`${hazardWord(domain)} name`);
  if (blank(h.consequence)) gaps.push("consequence");
  if (blank(h.controls)) gaps.push("current controls");
  if (blank(h.justification)) gaps.push("scoring justification");
  gaps.push(...methodValueIssues(method, domain, h));
  return gaps;
}

/** Submission / approval gates (spec: scope, ≥1 complete hazard/aspect, required answers, site availability). */
export function submitBlockers(f: AssessmentFacts): string[] {
  const out = draftBlockers(f);
  if (blank(f.description)) out.push("Describe the activity.");
  if (!f.departmentId) out.push("Choose the department.");
  else if (!f.departmentValid) out.push("Choose an active department from the company structure.");
  if (!f.ownerId) out.push("Choose the responsible person.");
  if (!f.approverId) out.push("Choose the approver.");
  if (!f.reviewDate) out.push("Set the review date.");
  const word = hazardWord(f.domain);
  if (!f.hazards.length) out.push(`Add at least one ${word}.`);
  f.hazards.forEach((h, i) => {
    const gaps = hazardGaps(h, f.method, f.domain);
    if (gaps.length) out.push(`${word.charAt(0).toUpperCase()}${word.slice(1)} ${i + 1}${h.name.trim() ? ` (${h.name.trim()})` : ""} needs: ${gaps.join(", ")}.`);
  });
  if (f.missingAnswers.length) out.push(`Answer the required questions: ${f.missingAnswers.join(", ")}.`);
  return out;
}

// ── Transitions ─────────────────────────────────────────────────────────────

export type AssessmentCommand = "save" | "submit" | "approve" | "revise" | "archive" | "restore" | "review" | "clone";

/** Status gate for a command (permission checks live in the access policy). */
export function commandBlockers(status: AssessmentStatus, command: AssessmentCommand): string[] {
  const label = ASSESSMENT_STATUS_LABELS[status];
  switch (command) {
    case "save":
      return status === "DRAFT" || status === "AWAITING_APPROVAL" ? [] : status === "APPROVED" ? ["Start a revision before changing an Approved assessment."] : ["Restore the assessment before changing it."];
    case "submit":
      return status === "DRAFT" ? [] : [`Only a Draft can be submitted (this assessment is ${label}).`];
    case "approve":
      return status === "DRAFT" || status === "AWAITING_APPROVAL" ? [] : [`An ${label} assessment cannot be approved.`];
    case "revise":
      return status === "APPROVED" ? [] : ["Only an Approved assessment can be revised."];
    case "archive":
      return status === "ARCHIVED" ? ["The assessment is already archived."] : [];
    case "restore":
      return status === "ARCHIVED" ? [] : ["Only an archived assessment can be restored."];
    case "review":
      return status === "APPROVED" ? [] : ["Periodic review is only available for Approved assessments."];
    case "clone":
      return [];
  }
}

/** Approval: the revision goes up by one (R-01: first approval = revision 1). */
export function nextRevision(current: number): number {
  return current + 1;
}

/** Restoring an archived assessment always returns it to Draft – never silently Approved (R-10). */
export function restoredStatus(): AssessmentStatus {
  return "DRAFT";
}

export type AssessmentNextStep = "SUBMIT" | "APPROVE" | "RECORD_REVIEW" | "START_REVISION" | "RESTORE" | null;

/** ONE primary next step for the detail header, given what the viewer may do. */
export function nextStep(status: AssessmentStatus, can: { edit: boolean; approve: boolean; review: boolean; archive: boolean }): AssessmentNextStep {
  switch (status) {
    case "DRAFT":
      return can.edit ? "SUBMIT" : can.approve ? "APPROVE" : null;
    case "AWAITING_APPROVAL":
      return can.approve ? "APPROVE" : null;
    case "APPROVED":
      return can.review ? "RECORD_REVIEW" : can.edit ? "START_REVISION" : null;
    case "ARCHIVED":
      return can.archive ? "RESTORE" : null;
  }
}

export interface LifecycleStage {
  key: string;
  label: string;
  state: "done" | "current" | "todo";
}

export function lifecycle(status: AssessmentStatus, revision: number): LifecycleStage[] {
  const order = ["DRAFT", "AWAITING_APPROVAL", "APPROVED"] as const;
  const idx = status === "ARCHIVED" ? -1 : order.indexOf(status);
  const stages: LifecycleStage[] = order.map((s, i) => ({
    key: s,
    label: s === "APPROVED" && revision > 0 ? `Approved · revision ${revision}` : ASSESSMENT_STATUS_LABELS[s],
    state: idx < 0 ? "todo" : i < idx ? "done" : i === idx ? (s === "APPROVED" ? "done" : "current") : "todo",
  }));
  stages.push({ key: "REVIEW", label: "Periodic review", state: status === "APPROVED" ? "current" : "todo" });
  return stages;
}

// ── Periodic review ─────────────────────────────────────────────────────────

export interface ReviewInput {
  status: AssessmentStatus;
  reviewDate: string | null;
  nextReviewDate: string | null;
  comment: string;
  today: string;
}

/** R-09: review date today or earlier, comment required, next date not before the review date. */
export function reviewBlockers(r: ReviewInput): string[] {
  const out = commandBlockers(r.status, "review");
  if (!r.reviewDate) out.push("Enter the review date.");
  else if (r.reviewDate > r.today) out.push("The review date cannot be in the future.");
  if (blank(r.comment)) out.push("Enter a review comment.");
  if (!r.nextReviewDate) out.push("Enter the next review date.");
  else if (r.reviewDate && r.nextReviewDate < r.reviewDate) out.push("The next review date cannot be before the review date.");
  return out;
}

export function isReviewOverdue(status: AssessmentStatus, reviewDate: string | null, today: string): boolean {
  return status === "APPROVED" && Boolean(reviewDate) && reviewDate! < today;
}

/** Approved with a review date inside the advance-notice window (or overdue). */
export function isReviewDue(status: AssessmentStatus, reviewDate: string | null, noticeDays: number, today: string): boolean {
  return status === "APPROVED" && Boolean(reviewDate) && reviewDate! <= addDaysIso(today, Math.max(0, noticeDays));
}

// ── Related assessments ─────────────────────────────────────────────────────

/** Related-assessment links stay within one site (cross-module: "permissible same-site Risk connections"). */
export function relatedLinkBlockers(a: { id: string; siteId: string | null }, b: { id: string; siteId: string | null }): string[] {
  if (a.id === b.id) return ["An assessment cannot be related to itself."];
  if (!a.siteId || !b.siteId) return ["Both assessments need a department before they can be related."];
  if (a.siteId !== b.siteId) return ["Only assessments at the same site can be related."];
  return [];
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export interface TaskInputFacts {
  kind: TaskKind;
  title: string;
  ownerId: string | null;
  createdOn: string | null;
  dueDate: string | null;
  programmeId: string | null;
  assessmentId: string | null;
  hazardId: string | null;
  parentStatus?: TaskStatus | null;
}

/** R-07: title/owner/dates, due not before creation, a programme is always required, RA needs assessment + hazard. */
export function taskBlockers(t: TaskInputFacts): string[] {
  const out: string[] = [];
  if (blank(t.title)) out.push("Enter a task title.");
  if (!t.ownerId) out.push("Choose the responsible person.");
  if (!t.createdOn) out.push("Enter the creation date.");
  if (!t.dueDate) out.push("Enter the due date.");
  if (t.createdOn && t.dueDate && t.dueDate < t.createdOn) out.push("The due date cannot be before the creation date.");
  if (!t.programmeId) out.push("Choose a management programme – every task belongs to one.");
  if (t.kind === "RA" && (!t.assessmentId || !t.hazardId)) out.push("Choose the assessment and the hazard / aspect this task improves.");
  if (t.parentStatus === "COMPLETED") out.push("The parent task is already completed – reopen work under a new task.");
  return out;
}

/** Top-level RA task with a scoring factor: completing it rescores the assessment. Sub-tasks never rescore. */
export function isScoringTask(t: { kind: TaskKind; parentId: string | null; factor: string | null }): boolean {
  return t.kind === "RA" && !t.parentId && Boolean(t.factor);
}

export interface CompletionFacts {
  status: TaskStatus;
  openSubTasks: number;
  comment: string;
  completedOn: string | null;
  createdOn: string;
  today: string;
  scoring: boolean;
  assessmentStatus: AssessmentStatus | null;
  actualValue: number | null;
  factorRange?: { label: string; min: number; max: number } | null;
}

/** R-06/R-07: open sub-tasks block the parent; comment + date between creation and today; scoring needs an Approved assessment. */
export function completionBlockers(c: CompletionFacts): string[] {
  const out: string[] = [];
  if (c.status === "COMPLETED") return ["The task is already completed."];
  if (c.openSubTasks > 0) out.push(`Complete every sub-task first (${c.openSubTasks} still open).`);
  if (blank(c.comment)) out.push("Enter a completion comment.");
  if (!c.completedOn || c.completedOn < c.createdOn || c.completedOn > c.today) out.push("Choose a completion date between the creation date and today.");
  if (c.scoring) {
    if (c.assessmentStatus !== "APPROVED") out.push("Approve the current assessment revision before completing a task that changes its score.");
    const r = c.factorRange;
    if (c.actualValue === null || !Number.isInteger(c.actualValue) || (r && (c.actualValue < r.min || c.actualValue > r.max))) {
      out.push(r ? `Enter the achieved ${r.label.toLowerCase()} (${r.min}–${r.max}).` : "Enter the achieved value.");
    }
  }
  return out;
}

export function isTaskOverdue(status: TaskStatus, dueDate: string, today: string): boolean {
  return status !== "COMPLETED" && dueDate < today;
}
