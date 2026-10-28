import { isValidDate, type EvaluationStatusKey, type LawTaskStatusKey } from "@/lib/law";

/**
 * Law rules – pure (no server-only), shared by the services, the screens and the tests.
 *
 *  - An evaluation is "Checked" (COMPLETE) when both narratives, the owner, the department and the
 *    next review date are recorded and no content-change review is pending. Partial information can
 *    always be saved – it shows as "Partly checked", never as checked.
 *  - A content-change review flag clears only when someone explicitly confirms the review on a
 *    complete evaluation. Opening, saving partial notes or finishing a task never clears it.
 *  - Not relevant needs a reason; all earlier work is kept and comes back on "Applies again".
 *  - The optional rating (0–100) is separate from completion. Summaries average only rated,
 *    relevant, in-scope items; none rated = "Not assessed" (null), never 0 % or 100 %.
 *  - A completed task, incident or action never changes the evaluation, rating or review flag.
 */

export interface EvaluationFacts {
  isRelevant: boolean;
  relevanceNotes: string;
  evaluationNotes: string;
  ownerId: string | null;
  departmentId: string | null;
  nextReviewDate: string | null;
  reviewRequired: boolean;
}

/** What is still missing before the evaluation counts as checked (plain words, in form order). */
export function missingForComplete(e: Omit<EvaluationFacts, "isRelevant" | "reviewRequired">): string[] {
  const out: string[] = [];
  if (!e.relevanceNotes.trim()) out.push("Write why it applies and which controls are in place.");
  if (!e.evaluationNotes.trim()) out.push("Write how you checked it: the evidence, what you found and any gaps.");
  if (!e.ownerId) out.push("Choose who is responsible.");
  if (!e.departmentId) out.push("Choose the responsible department.");
  if (!e.nextReviewDate) out.push("Choose the next review date.");
  return out;
}

export function isEvaluationComplete(e: Omit<EvaluationFacts, "isRelevant" | "reviewRequired">): boolean {
  return missingForComplete(e).length === 0;
}

export function evaluationStatus(e: EvaluationFacts): EvaluationStatusKey {
  if (!e.isRelevant) return "NOT_RELEVANT";
  if (e.reviewRequired) return "REVIEW_REQUIRED";
  if (isEvaluationComplete(e)) return "COMPLETE";
  return e.relevanceNotes.trim() || e.evaluationNotes.trim() ? "PARTIAL" : "NOT_STARTED";
}

/** Relevant, in-scope requirement whose next review date has passed. */
export function isReviewOverdue(e: Pick<EvaluationFacts, "isRelevant" | "nextReviewDate">, today: string): boolean {
  return e.isRelevant && Boolean(e.nextReviewDate) && e.nextReviewDate! < today;
}

export interface EvaluationSaveInput {
  relevanceNotes: string;
  evaluationNotes: string;
  rating: number | null;
  ownerId: string | null;
  departmentId: string | null;
  nextReviewDate: string | null;
  /** "I have reviewed the controls and evidence against the changed requirement." */
  confirmReviewed: boolean;
}

export function ratingProblem(rating: number | null): string | null {
  if (rating === null) return null;
  return Number.isInteger(rating) && rating >= 0 && rating <= 100 ? null : "The rating must be a whole number from 0 to 100.";
}

/** Gates for saving an evaluation (partial saves are allowed). */
export function evaluationSaveBlockers(input: EvaluationSaveInput, ctx: { isRelevant: boolean; reviewRequired: boolean; today: string; currentNextReviewDate: string | null }): string[] {
  const out: string[] = [];
  if (!ctx.isRelevant) out.push("This requirement is marked as not applying – mark it as applying again before checking it.");
  const rating = ratingProblem(input.rating);
  if (rating) out.push(rating);
  if (input.nextReviewDate) {
    if (!isValidDate(input.nextReviewDate)) out.push("Choose a valid next review date.");
    else if (input.nextReviewDate !== ctx.currentNextReviewDate && input.nextReviewDate < ctx.today) out.push("The next review date cannot be in the past.");
  }
  if (input.confirmReviewed && ctx.reviewRequired) {
    const missing = missingForComplete(input);
    if (missing.length) out.push(`To confirm the review, complete the check first: ${missing.join(" ")}`);
  }
  return out;
}

/** Review flag and evaluated date after a save. */
export function evaluationOutcome(input: EvaluationSaveInput, ctx: { reviewRequired: boolean; evaluatedOn: string | null; today: string }): { reviewRequired: boolean; evaluatedOn: string | null; reviewConfirmed: boolean } {
  const complete = isEvaluationComplete(input);
  const reviewConfirmed = ctx.reviewRequired && input.confirmReviewed && complete;
  return { reviewRequired: ctx.reviewRequired && !reviewConfirmed, evaluatedOn: complete ? ctx.today : ctx.evaluatedOn, reviewConfirmed };
}

export function exclusionBlockers(reason: string): string[] {
  return reason.trim() ? [] : ["Explain why this requirement does not apply to us."];
}

// ── Summaries ───────────────────────────────────────────────────────────────

export interface SummaryItem extends EvaluationFacts {
  /** Applies under the profile's current activities / jurisdiction (or an active company requirement). */
  inScope: boolean;
  rating: number | null;
}

export interface ComplianceSummary {
  /** Relevant, in-scope requirements. */
  total: number;
  complete: number;
  /** In scope but marked not relevant. */
  excluded: number;
  /** Needs attention: content-change review or next review date passed. */
  review: number;
  rated: number;
  /** Average of rated relevant items (rounded), null = Not assessed. */
  score: number | null;
  /** Not in the current profile scope (kept with their work). */
  outside: number;
}

export function complianceSummary(items: readonly SummaryItem[], today: string): ComplianceSummary {
  const scoped = items.filter((i) => i.inScope);
  const relevant = scoped.filter((i) => i.isRelevant);
  const rated = relevant.filter((i) => i.rating !== null);
  return {
    total: relevant.length,
    complete: relevant.filter((i) => evaluationStatus(i) === "COMPLETE").length,
    excluded: scoped.length - relevant.length,
    review: relevant.filter((i) => i.reviewRequired || isReviewOverdue(i, today)).length,
    rated: rated.length,
    score: rated.length ? Math.round(rated.reduce((sum, i) => sum + i.rating!, 0) / rated.length) : null,
    outside: items.length - scoped.length,
  };
}

// ── Next step and stepper ───────────────────────────────────────────────────

export type RequirementStep = "check" | "finish" | "review" | "recheck" | "restore";

/** The ONE primary button on a requirement, for someone who may evaluate it. */
export function nextStep(status: EvaluationStatusKey, opts: { canEvaluate: boolean; reviewOverdue: boolean; inScope: boolean }): RequirementStep | null {
  if (!opts.canEvaluate || !opts.inScope) return null;
  switch (status) {
    case "NOT_RELEVANT":
      return "restore";
    case "REVIEW_REQUIRED":
      return "review";
    case "NOT_STARTED":
      return "check";
    case "PARTIAL":
      return "finish";
    case "COMPLETE":
      return opts.reviewOverdue ? "recheck" : null;
  }
}

export interface LifecycleStep {
  key: string;
  label: string;
  state: "done" | "current" | "todo";
}

/** Why it applies → How we checked → Owner & next review → Checked (or Doesn't apply / Review the change). */
export function lifecycle(e: EvaluationFacts): LifecycleStep[] {
  if (!e.isRelevant) return [{ key: "NOT_RELEVANT", label: "Doesn't apply", state: "current" }];
  const parts = [
    { key: "RELEVANCE", label: "Why it applies", done: Boolean(e.relevanceNotes.trim()) },
    { key: "EVALUATION", label: "How we checked", done: Boolean(e.evaluationNotes.trim()) },
    { key: "RESPONSIBILITY", label: "Owner & next review", done: Boolean(e.ownerId && e.departmentId && e.nextReviewDate) },
  ];
  const allDone = parts.every((p) => p.done);
  const last = e.reviewRequired
    ? { key: "REVIEW", label: "Review the change", done: false }
    : { key: "CHECKED", label: "Checked", done: allDone };
  const steps = [...parts, last];
  const firstOpen = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({ key: s.key, label: s.label, state: s.done ? "done" : i === firstOpen ? "current" : "todo" }));
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export function taskSaveBlockers(input: { title: string; ownerId: string | null; dueDate: string | null; departmentId: string | null; today: string; currentDueDate?: string | null }): string[] {
  const out: string[] = [];
  if (!input.title.trim()) out.push("Describe the task.");
  else if (input.title.trim().length > 200) out.push("Keep the task description under 200 characters.");
  if (!input.ownerId) out.push("Choose who will do it.");
  if (!input.departmentId) out.push("Choose the responsible department.");
  if (!input.dueDate || !isValidDate(input.dueDate)) out.push("Choose a valid due date.");
  else if (input.dueDate !== (input.currentDueDate ?? null) && input.dueDate < input.today) out.push("The due date cannot be in the past.");
  return out;
}

export function taskCompletionBlockers(input: { status: LawTaskStatusKey; archived: boolean; notes: string }): string[] {
  if (input.archived) return ["Restore the task before completing it."];
  if (input.status !== "OPEN") return ["This task is already done."];
  return input.notes.trim() ? [] : ["Say what was done (completion comment)."];
}

// ── Profiles, company requirements, links and follow-ups ────────────────────

export function profileBlockers(input: { name: string; ownerId: string | null; siteId: string | null; jurisdiction: string; activities: readonly string[] }): string[] {
  const out: string[] = [];
  if (!input.name.trim()) out.push("Give the profile a name.");
  if (!input.ownerId) out.push("Choose the profile owner.");
  if (!input.siteId) out.push("Choose the site.");
  if (!input.jurisdiction.trim()) out.push("Choose the jurisdiction (country or region whose laws apply).");
  if (!input.activities.length) out.push("Tick at least one activity.");
  return out;
}

export function otherRequirementBlockers(input: { title: string; requirementText: string; category: string }): string[] {
  const out: string[] = [];
  if (!input.title.trim()) out.push("Give the requirement a name.");
  if (!input.requirementText.trim()) out.push("Write what the requirement or commitment asks for.");
  if (!input.category.trim()) out.push("Choose a category.");
  return out;
}

export function linkBlockers(input: { targetId: string | null; context: string }): string[] {
  const out: string[] = [];
  if (!input.targetId) out.push("Choose the record to link.");
  if (!input.context.trim()) out.push("Say how the record relates to this requirement (hazard, aspect or reason).");
  return out;
}

export function raiseActionBlockers(input: { description: string; ownerId: string | null; departmentId: string | null; dueDate: string | null; today: string }): string[] {
  const out: string[] = [];
  if (!input.description.trim()) out.push("Describe the corrective action.");
  if (!input.ownerId) out.push("Choose who will do it.");
  if (!input.departmentId) out.push("Choose a department in this profile's site.");
  if (!input.dueDate || !isValidDate(input.dueDate)) out.push("Choose a valid due date.");
  else if (input.dueDate < input.today) out.push("The due date cannot be in the past.");
  return out;
}
