import {
  COMPLIANCE_LABELS,
  type AnswerKey,
  type ApplicabilityKey,
  type ComplianceKey,
  type LegalStatusKey,
  type SlawActionStatusKey,
} from "./index";

/**
 * Simplified law – pure rules (client + server, unit-tested). They follow the boss's storyboard:
 *  - step 4 "Applicable to us?": any Yes means the law is likely relevant; "No" needs a reason;
 *  - step 5 "Requirements": Compliant needs a reason (evidence); Not compliant needs an action,
 *    an owner and a due date; N/A is skipped; actions are tracked until marked done.
 */

// ── Step 4: applicability ───────────────────────────────────────────────────

export type Suggestion = "LIKELY" | "UNLIKELY" | "UNKNOWN";

/** Any Yes → likely applies; every question answered No → probably not; otherwise keep answering. */
export function applicabilitySuggestion(answers: readonly (AnswerKey | null | undefined)[]): Suggestion {
  if (answers.some((a) => a === "YES")) return "LIKELY";
  if (answers.length > 0 && answers.every((a) => a === "NO")) return "UNLIKELY";
  return "UNKNOWN";
}

export const SUGGESTION_TEXT: Record<Suggestion, string> = {
  LIKELY: "At least one answer is Yes, so this law is likely to apply to us.",
  UNLIKELY: "Every answer is No, so this law probably does not apply to us.",
  UNKNOWN: "Answer the questions – any Yes means the law is likely to apply.",
};

/** Laws that can still be checked (repealed ones are listed for reference only). */
export function canBeChecked(status: LegalStatusKey): boolean {
  return status !== "REPEALED";
}

export function applicabilityBlockers(input: { status: LegalStatusKey; decision: ApplicabilityKey | null; reason: string }): string[] {
  const out: string[] = [];
  if (!canBeChecked(input.status)) out.push("This law is repealed – there is nothing to check.");
  if (input.decision === "DOES_NOT_APPLY" && !input.reason.trim()) out.push("Say why the law does not apply to us.");
  return out;
}

// ── Step 5: requirements ────────────────────────────────────────────────────

export interface RequirementDraft {
  compliance: ComplianceKey;
  reason: string;
  actionText: string;
  actionOwnerId: string | null;
  actionDueDate: string | null;
}

export interface RequirementState extends RequirementDraft {
  actionStatus: SlawActionStatusKey;
}

const sameAction = (a: RequirementDraft, b: RequirementDraft) =>
  a.actionText.trim() === b.actionText.trim() && (a.actionOwnerId ?? null) === (b.actionOwnerId ?? null) && (a.actionDueDate ?? null) === (b.actionDueDate ?? null);

/** What stops a requirement row from being saved (plain words, shown as a list). */
export function requirementBlockers(prev: RequirementState, next: RequirementDraft, today: string): string[] {
  const out: string[] = [];
  if (next.compliance === "COMPLIANT" && !next.reason.trim()) out.push("Say why we are compliant – for example the evidence we have.");
  if (next.compliance === "NOT_COMPLIANT") {
    if (!next.actionText.trim()) out.push("Say what action will fix the gap.");
    if (!next.actionOwnerId) out.push("Choose who will do the action.");
    if (!next.actionDueDate) out.push("Choose a due date for the action.");
    else if (!sameAction(prev, next) && next.actionDueDate < today) out.push("The due date cannot be in the past.");
  }
  return out;
}

export interface ActionOutcome {
  actionStatus: SlawActionStatusKey;
  /** The action was (re)opened by this save – notify the owner. */
  opened: boolean;
  /** An open action was closed automatically by this save. */
  closedNote: string | null;
}

/**
 * The action that follows a compliance answer:
 *  - Not compliant → the action is open (a done action stays done unless its text, owner or due date change);
 *  - any other answer → an open action is closed automatically ("no longer needed"); history is kept.
 */
export function actionAfterSave(prev: RequirementState, next: RequirementDraft): ActionOutcome {
  if (next.compliance === "NOT_COMPLIANT") {
    if (prev.actionStatus === "OPEN") return { actionStatus: "OPEN", opened: prev.actionOwnerId !== next.actionOwnerId, closedNote: null };
    if (prev.actionStatus === "DONE" && prev.compliance === "NOT_COMPLIANT" && sameAction(prev, next)) return { actionStatus: "DONE", opened: false, closedNote: null };
    return { actionStatus: "OPEN", opened: true, closedNote: null };
  }
  if (prev.actionStatus === "OPEN") return { actionStatus: "DONE", opened: false, closedNote: `Closed automatically – the requirement was marked ${COMPLIANCE_LABELS[next.compliance]}.` };
  return { actionStatus: prev.actionStatus, opened: false, closedNote: null };
}

/** Not compliant, but its action is done: someone should look at the requirement again. */
export function needsRecheck(compliance: ComplianceKey, actionStatus: SlawActionStatusKey): boolean {
  return compliance === "NOT_COMPLIANT" && actionStatus === "DONE";
}

export function isActionOverdue(actionStatus: SlawActionStatusKey, dueDate: string | null, today: string): boolean {
  return actionStatus === "OPEN" && Boolean(dueDate) && dueDate! < today;
}

export function actionCompleteBlockers(input: { actionStatus: SlawActionStatusKey; note: string }): string[] {
  const out: string[] = [];
  if (input.actionStatus !== "OPEN") out.push("This action is not open any more.");
  if (!input.note.trim()) out.push("Say what was done.");
  return out;
}

// ── Summaries ───────────────────────────────────────────────────────────────

export interface RequirementCounts {
  total: number;
  compliant: number;
  notCompliant: number;
  notAssessed: number;
  notApplicable: number;
  openActions: number;
  recheck: number;
}

export function requirementCounts(rows: readonly { compliance: ComplianceKey; actionStatus: SlawActionStatusKey }[]): RequirementCounts {
  const c: RequirementCounts = { total: rows.length, compliant: 0, notCompliant: 0, notAssessed: 0, notApplicable: 0, openActions: 0, recheck: 0 };
  for (const r of rows) {
    if (r.compliance === "COMPLIANT") c.compliant++;
    else if (r.compliance === "NOT_COMPLIANT") c.notCompliant++;
    else if (r.compliance === "NOT_APPLICABLE") c.notApplicable++;
    else c.notAssessed++;
    if (r.actionStatus === "OPEN") c.openActions++;
    if (needsRecheck(r.compliance, r.actionStatus)) c.recheck++;
  }
  return c;
}

export type ProgressKey = "REPEALED" | "NOT_CHECKED" | "DOES_NOT_APPLY" | "NO_REQUIREMENTS" | "NOT_COMPLIANT" | "TO_ASSESS" | "COMPLIANT";

export interface Progress {
  key: ProgressKey;
  label: string;
}

/** Where the company stands on one law, in plain words (badges in lists and on the detail page). */
export function lawProgress(input: { status: LegalStatusKey; applicability: ApplicabilityKey; counts: RequirementCounts }): Progress {
  const { counts } = input;
  if (!canBeChecked(input.status)) return { key: "REPEALED", label: "Nothing to check" };
  if (input.applicability === "NOT_CHECKED") return { key: "NOT_CHECKED", label: "Not checked yet" };
  if (input.applicability === "DOES_NOT_APPLY") return { key: "DOES_NOT_APPLY", label: "Does not apply" };
  if (counts.total === 0) return { key: "NO_REQUIREMENTS", label: "Applies – no requirements listed" };
  if (counts.notCompliant > 0) return { key: "NOT_COMPLIANT", label: `Applies – ${counts.notCompliant} not compliant` };
  if (counts.notAssessed > 0) return { key: "TO_ASSESS", label: `Applies – ${counts.notAssessed} to check` };
  return { key: "COMPLIANT", label: "Applies – compliant" };
}

// ── Next step and the 4-step bar ────────────────────────────────────────────

export type NextStep = "applicability" | "requirements" | null;

/** One obvious next step on the legislation page (only for people who may check). */
export function nextStep(input: { status: LegalStatusKey; applicability: ApplicabilityKey; counts: RequirementCounts; canAssess: boolean }): NextStep {
  if (!input.canAssess || !canBeChecked(input.status)) return null;
  if (input.applicability === "NOT_CHECKED") return "applicability";
  if (input.applicability === "APPLIES" && (input.counts.notAssessed > 0 || input.counts.recheck > 0)) return "requirements";
  return null;
}

export type StepState = "done" | "current" | "todo" | "skipped";

export interface RegisterStep {
  key: "category" | "legislation" | "applicability" | "requirements";
  label: string;
  state: StepState;
}

/** The storyboard's bar "1. Select category · 2. Legislation · 3. Applicability · 4. Requirements". */
export function registerSteps(at: "category" | "legislation" | "law", law?: { status: LegalStatusKey; applicability: ApplicabilityKey; counts: RequirementCounts }): RegisterStep[] {
  const steps: RegisterStep[] = [
    { key: "category", label: "Select category", state: at === "category" ? "current" : "done" },
    { key: "legislation", label: "Legislation", state: at === "legislation" ? "current" : at === "category" ? "todo" : "done" },
    { key: "applicability", label: "Applicability", state: "todo" },
    { key: "requirements", label: "Requirements", state: "todo" },
  ];
  if (at !== "law" || !law) return steps;
  if (!canBeChecked(law.status)) {
    steps[2]!.state = "skipped";
    steps[3]!.state = "skipped";
    return steps;
  }
  if (law.applicability === "NOT_CHECKED") {
    steps[2]!.state = "current";
    return steps;
  }
  steps[2]!.state = "done";
  if (law.applicability === "DOES_NOT_APPLY") steps[3]!.state = "skipped";
  else steps[3]!.state = law.counts.total > 0 && law.counts.notAssessed === 0 && law.counts.notCompliant === 0 ? "done" : "current";
  return steps;
}

// ── Overview ────────────────────────────────────────────────────────────────

/** Columns of the article overview: every "applies to" role, in first-seen order (case-insensitive). */
export function overviewRoles(articles: readonly { appliesTo: readonly string[] }[]): string[] {
  const seen = new Map<string, string>();
  for (const a of articles) for (const role of a.appliesTo) {
    const name = role.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}

export function appliesToRole(article: { appliesTo: readonly string[] }, role: string): boolean {
  return article.appliesTo.some((r) => r.trim().toLowerCase() === role.toLowerCase());
}

/** Clean list of roles typed by a person ("Manufacturer, importer") – trimmed, unique, at most `max`. */
export function parseRoles(input: string | readonly string[], max = 8): string[] {
  const parts = typeof input === "string" ? input.split(/[,;\n]/) : input;
  return overviewRoles([{ appliesTo: parts.map((p) => p.trim()).filter(Boolean) }]).slice(0, max);
}

// ── Lists ───────────────────────────────────────────────────────────────────

/** A list name that is not empty and not already used (case-insensitive), e.g. a jurisdiction. */
export function nameBlockers(name: string, existing: readonly string[], what: string, ignore?: string): string[] {
  const clean = name.trim();
  if (!clean) return [`Type a name for the ${what}.`];
  if (existing.some((e) => e.toLowerCase() === clean.toLowerCase() && e.toLowerCase() !== (ignore ?? "").toLowerCase())) return [`There is already a ${what} called "${clean}".`];
  return [];
}

/** Moves an item up or down in a list ordered by sortOrder; returns the new order of ids. */
export function moveInOrder(ids: readonly string[], id: string, direction: "up" | "down"): string[] {
  const out = [...ids];
  const i = out.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** "8 EU, 12 Ireland" for a sub-category card. */
export function jurisdictionBreakdown(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([j, n]) => `${n} ${j}`)
    .join(", ");
}
