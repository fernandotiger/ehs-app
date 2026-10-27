/**
 * Incident & corrective-action lifecycle rules – pure (no I/O), shared by the services and the
 * tests (examples I-01…I-12 in ../skills/ehs-functional-rebuild/examples/incident-examples.md).
 *
 * Incident status is DERIVED from the actual work (draft flag, explicit closure, investigation,
 * linked actions and their follow-ups); it is never edited directly. Every guard returns the list
 * of things still missing, so the UI can explain a blocked step exactly.
 */
import {
  ACTION_STATE_LABELS,
  inclusiveDays,
  type ActionStateKey,
  type IncidentStatusKey,
  type InvestigationStatusKey,
} from "../../../lib/incidents";

// ── Actions and follow-up resolution ────────────────────────────────────────

export interface ActionNode {
  id: string;
  reference?: string;
  state: ActionStateKey;
  parentActionId: string | null;
  /** Incidents the action is linked to. */
  incidentIds: string[];
}

/**
 * Follow-ups that count for an ineffective action: its direct follow-ups that kept ALL of the
 * original incident associations (a follow-up never drops an incident).
 */
export function applicableFollowUps(action: ActionNode, all: readonly ActionNode[]): ActionNode[] {
  return all.filter((b) => b.parentActionId === action.id && action.incidentIds.every((id) => b.incidentIds.includes(id)));
}

/**
 * Effective → resolved. Ineffective → resolved only when it has applicable follow-ups and EVERY
 * one is effective or itself resolved through effective follow-up (recursive; an open sibling
 * keeps blocking). Anything else is unresolved.
 */
export function isActionResolved(action: ActionNode, all: readonly ActionNode[], seen: ReadonlySet<string> = new Set()): boolean {
  if (action.state === "EFFECTIVE") return true;
  if (action.state !== "INEFFECTIVE" || seen.has(action.id)) return false;
  const next = new Set(seen).add(action.id);
  const followUps = applicableFollowUps(action, all);
  return followUps.length > 0 && followUps.every((f) => isActionResolved(f, all, next));
}

export function unresolvedActions(actions: readonly ActionNode[], all: readonly ActionNode[] = actions): ActionNode[] {
  return actions.filter((a) => !isActionResolved(a, all));
}

/** Plain-words reason an action still blocks closure. */
export function unresolvedReason(action: ActionNode): string {
  switch (action.state) {
    case "OPEN":
    case "IN_PROGRESS":
      return "not completed yet";
    case "AWAITING_EFFECTIVENESS":
      return "effectiveness review pending";
    case "INEFFECTIVE":
      return "ineffective – its follow-up actions are not all effective yet";
    default:
      return ACTION_STATE_LABELS[action.state].toLowerCase();
  }
}

// ── Incident status ─────────────────────────────────────────────────────────

export interface InvestigationFactsLite {
  status: InvestigationStatusKey;
  actionsRequired: boolean | null;
}

export interface IncidentFacts {
  isDraft: boolean;
  closed: boolean;
  investigation: InvestigationFactsLite | null;
  /** Actions linked to the incident (follow-ups inherit links, so they are included). */
  actions: readonly ActionNode[];
  /** Action graph used to resolve follow-ups (defaults to `actions`). */
  graph?: readonly ActionNode[];
}

/** Spec "Registers and states", in order of precedence. */
export function deriveIncidentStatus(f: IncidentFacts): IncidentStatusKey {
  if (f.isDraft) return "DRAFT";
  if (f.closed) return "CLOSED";
  if (!f.investigation) return "OPEN";
  if (f.investigation.status === "IN_PROGRESS") return "INVESTIGATING";
  const graph = f.graph ?? f.actions;
  if (f.actions.some((a) => a.state === "INEFFECTIVE" && !isActionResolved(a, graph))) return "FOLLOW_UP_REQUIRED";
  if (f.actions.some((a) => a.state === "OPEN" || a.state === "IN_PROGRESS")) return "ACTION_IN_PROGRESS";
  if (f.actions.some((a) => a.state === "AWAITING_EFFECTIVENESS")) return "AWAITING_EFFECTIVENESS";
  if (f.investigation.actionsRequired && f.actions.length === 0) return "ACTION_REQUIRED";
  return "READY_TO_CLOSE";
}

// ── Closure ─────────────────────────────────────────────────────────────────

export interface ClosureFacts extends IncidentFacts {
  investigationRequired: boolean;
  closureNote?: string | null;
}

/**
 * Everything that prevents explicit closure (empty = may close). With `ignoreNote` the note is not
 * checked (used to show whether the incident is ready before the note is typed).
 */
export function closureBlockers(f: ClosureFacts, options: { ignoreNote?: boolean } = {}): string[] {
  if (f.isDraft) return ["Submit the report before closing it."];
  if (f.closed) return ["The incident is already closed."];
  const out: string[] = [];
  if (!f.investigation && f.investigationRequired) out.push("This incident type requires an investigation – start and complete it first.");
  if (f.investigation?.status === "IN_PROGRESS") out.push("Complete the investigation first – it is still in progress.");
  if (f.investigation?.status === "COMPLETED" && f.investigation.actionsRequired && f.actions.length === 0) {
    out.push("The investigation says action is required – add or link an action first.");
  }
  const graph = f.graph ?? f.actions;
  for (const action of unresolvedActions(f.actions, graph)) {
    out.push(`${action.reference ?? "An action"} is ${unresolvedReason(action)}.`);
  }
  if (!options.ignoreNote && !f.closureNote?.trim()) out.push("Enter a closure note.");
  return out;
}

// ── Reporting ───────────────────────────────────────────────────────────────

export interface ReportFacts {
  title: string | null | undefined;
  occurredAt: string | null | undefined;
  departmentId: string | null | undefined;
  investigationTargetDate: string | null | undefined;
  typeActive: boolean;
  /** The type has at least one active subtype → a subtype must be chosen. */
  typeHasSubtypes: boolean;
  subtypeId: string | null | undefined;
  /** The chosen subtype belongs to the type and is active (or was already on the record). */
  subtypeValid: boolean;
  people: readonly { name: string | null | undefined }[];
  investigatorCount: number;
  assignmentRequired: boolean;
  multipleInvestigators: boolean;
  /** Labels of required questions that are not answered (from validateAnswers). */
  missingAnswers: readonly string[];
  /** Occurred-at in the future is not accepted (ISO now for tests). */
  now?: string;
}

/** Saving a draft needs a title; the investigator policy is respected even for drafts. */
export function draftBlockers(f: Pick<ReportFacts, "title" | "investigatorCount" | "multipleInvestigators">): string[] {
  const out: string[] = [];
  if (!f.title?.trim()) out.push("Enter an incident title.");
  if (!f.multipleInvestigators && f.investigatorCount > 1) out.push("This incident type allows only one investigator.");
  return out;
}

/** Everything a submitted report must have (I-01, I-02). */
export function submitBlockers(f: ReportFacts): string[] {
  const out = draftBlockers(f);
  if (!f.typeActive) out.push("Choose an active incident type.");
  if (f.typeHasSubtypes && !f.subtypeId) out.push("Choose a subtype.");
  else if (f.subtypeId && !f.subtypeValid) out.push("Choose an active subtype of this incident type.");
  if (!f.occurredAt) out.push("Enter the date and time of the event.");
  else if (f.now && f.occurredAt > f.now) out.push("The date and time of the event cannot be in the future.");
  if (!f.departmentId) out.push("Choose the department where it happened.");
  if (!f.investigationTargetDate) out.push("Enter the investigation target date.");
  if (f.people.length === 0) out.push("Add at least one person involved (enter Unknown if the name is not known).");
  else if (f.people.some((p) => !p.name?.trim())) out.push("Enter a name for every person, or Unknown if the name is not known.");
  if (f.assignmentRequired && f.investigatorCount === 0) out.push("Assign an investigator.");
  for (const label of f.missingAnswers) out.push(`Answer the required question “${label}”.`);
  return out;
}

// ── Investigation ───────────────────────────────────────────────────────────

export interface AbsenceFacts {
  startDate: string;
  endDate: string;
  restricted: boolean;
}

/**
 * Days lost: inclusive calendar days of every non-Restricted-duties period, summed. Overlapping
 * periods are NOT de-duplicated and no working-day calendar is applied (I-04).
 */
export function daysLost(absences: readonly AbsenceFacts[]): number {
  return absences.filter((a) => !a.restricted).reduce((sum, a) => sum + inclusiveDays(a.startDate, a.endDate), 0);
}

export interface InvestigationFacts {
  investigatorId: string | null | undefined;
  causeIds: readonly string[];
  closingDecision: string | null | undefined;
  actionsRequired: boolean | null | undefined;
  healthSafetyImpact: boolean;
  hazardGroup: string | null | undefined;
  environmentalImpact: boolean;
  environmentalAspect: string | null | undefined;
  environmentalDescription: string | null | undefined;
  environmentalDuration: number | null | undefined;
  reportable: boolean;
  reporteeIds: readonly string[];
  absences: readonly { startDate: string; endDate: string }[];
  operatingHoursLost: number | null | undefined;
  /** Labels of required investigation questions (incl. findings/root cause) not answered. */
  missingAnswers: readonly string[];
}

/** Data errors rejected on every save (in progress or complete). */
export function investigationDataErrors(f: Pick<InvestigationFacts, "absences" | "operatingHoursLost" | "environmentalDuration">): string[] {
  const out: string[] = [];
  f.absences.forEach((a, i) => {
    if (!a.startDate || !a.endDate) out.push(`Absence period ${i + 1}: enter a start and end date.`);
    else if (a.endDate < a.startDate) out.push(`Absence period ${i + 1}: the end date is before the start date.`);
  });
  if (f.operatingHoursLost != null && f.operatingHoursLost < 0) out.push("Operating hours lost cannot be negative.");
  if (f.environmentalDuration != null && f.environmentalDuration < 0) out.push("The environmental impact duration cannot be negative.");
  return out;
}

/** Everything completion needs (I-03, I-04). */
export function investigationCompletionBlockers(f: InvestigationFacts): string[] {
  const out = investigationDataErrors(f);
  if (!f.investigatorId) out.push("Choose the investigator.");
  for (const label of f.missingAnswers) out.push(`Answer the required question “${label}”.`);
  if (f.healthSafetyImpact && !f.hazardGroup) out.push("Choose the hazard group for the health & safety impact.");
  if (f.environmentalImpact) {
    if (!f.environmentalAspect) out.push("Choose the environmental aspect.");
    if (!f.environmentalDescription?.trim()) out.push("Describe the environmental impact.");
  }
  if (f.causeIds.length === 0) out.push("Choose at least one cause.");
  if (f.reportable && f.reporteeIds.length === 0) out.push("Choose at least one reportee for a reportable incident.");
  if (f.actionsRequired === null || f.actionsRequired === undefined) out.push("Say whether actions are required.");
  if (!f.closingDecision?.trim()) out.push("Enter the closing decision.");
  return out;
}

// ── Action lifecycle ────────────────────────────────────────────────────────

export interface ActionCompletionFacts {
  state: ActionStateKey;
  tasks: readonly { title: string; done: boolean }[];
  completionComment: string | null | undefined;
  reviewerId: string | null | undefined;
  plannedReviewDate: string | null | undefined;
}

/** Completing moves the action to Awaiting effectiveness (never straight to Effective) – I-05. */
export function actionCompletionBlockers(f: ActionCompletionFacts): string[] {
  if (f.state !== "OPEN" && f.state !== "IN_PROGRESS") return [`The action is already ${ACTION_STATE_LABELS[f.state].toLowerCase()}.`];
  const out: string[] = [];
  const open = f.tasks.filter((t) => !t.done);
  if (open.length) out.push(`Complete every task first (${open.length} still open: ${open.map((t) => t.title).join(", ")}).`);
  if (!f.completionComment?.trim()) out.push("Describe what was done.");
  if (!f.reviewerId) out.push("Choose who will review effectiveness.");
  if (!f.plannedReviewDate) out.push("Choose the effectiveness review date.");
  return out;
}

export interface ActionReviewFacts {
  state: ActionStateKey;
  plannedReviewDate: string | null | undefined;
  /** Company-local date (yyyy-mm-dd). */
  today: string;
  comment: string | null | undefined;
}

/** Effective/Ineffective only on or after the planned date, with a comment – I-06 (no admin override). */
export function actionReviewBlockers(f: ActionReviewFacts): string[] {
  if (f.state !== "AWAITING_EFFECTIVENESS") return ["Only an action awaiting effectiveness can be reviewed."];
  const out: string[] = [];
  if (!f.plannedReviewDate) out.push("Set the planned effectiveness review date first.");
  else if (f.today < f.plannedReviewDate.slice(0, 10)) out.push(`Effectiveness can be recorded from ${f.plannedReviewDate.slice(0, 10)} (the planned review date).`);
  if (!f.comment?.trim()) out.push("Enter a review comment.");
  return out;
}

/** Explicit follow-up is only raised from an Ineffective action. */
export function followUpBlockers(state: ActionStateKey): string[] {
  return state === "INEFFECTIVE" ? [] : ["Follow-up actions are raised from an action reviewed as Ineffective."];
}

export function isActionOverdue(a: { state: ActionStateKey; dueDate: string; plannedReviewDate?: string | null }, today: string): boolean {
  if (a.state === "OPEN" || a.state === "IN_PROGRESS") return a.dueDate.slice(0, 10) < today;
  if (a.state === "AWAITING_EFFECTIVENESS") return Boolean(a.plannedReviewDate) && a.plannedReviewDate!.slice(0, 10) < today;
  return false;
}

// ── Next step (ONE primary button) and lifecycle stepper ────────────────────

export type IncidentNextStep =
  | "SUBMIT"
  | "START_INVESTIGATION"
  | "COMPLETE_INVESTIGATION"
  | "ADD_ACTION"
  | "TRACK_ACTIONS"
  | "REVIEW_ACTIONS"
  | "FOLLOW_UP"
  | "CLOSE"
  | "REOPEN";

export function nextStep(status: IncidentStatusKey, type: { investigationEnabled: boolean }): IncidentNextStep {
  switch (status) {
    case "DRAFT":
      return "SUBMIT";
    case "OPEN":
      return type.investigationEnabled ? "START_INVESTIGATION" : "CLOSE";
    case "INVESTIGATING":
      return "COMPLETE_INVESTIGATION";
    case "ACTION_REQUIRED":
      return "ADD_ACTION";
    case "ACTION_IN_PROGRESS":
      return "TRACK_ACTIONS";
    case "AWAITING_EFFECTIVENESS":
      return "REVIEW_ACTIONS";
    case "FOLLOW_UP_REQUIRED":
      return "FOLLOW_UP";
    case "READY_TO_CLOSE":
      return "CLOSE";
    case "CLOSED":
      return "REOPEN";
  }
}

export type StageState = "done" | "current" | "todo" | "skipped";
export interface LifecycleStage {
  key: "REPORTED" | "INVESTIGATION" | "ACTIONS" | "EFFECTIVENESS" | "CLOSED";
  label: string;
  state: StageState;
}

/** Reported → Investigation → Actions → Effectiveness → Closed. */
export function lifecycle(f: IncidentFacts & { investigationEnabled: boolean }): LifecycleStage[] {
  const status = deriveIncidentStatus(f);
  const graph = f.graph ?? f.actions;
  const hasActions = f.actions.length > 0;
  const actionsDone = hasActions && f.actions.every((a) => !["OPEN", "IN_PROGRESS"].includes(a.state));
  const effectivenessDone = hasActions && unresolvedActions(f.actions, graph).length === 0;
  const investigationDone = f.investigation?.status === "COMPLETED";
  const noActionNeeded = investigationDone && !f.investigation?.actionsRequired && !hasActions;

  const stages: LifecycleStage[] = [
    { key: "REPORTED", label: "Reported", state: f.isDraft ? "current" : "done" },
    {
      key: "INVESTIGATION",
      label: "Investigation",
      state: investigationDone ? "done" : f.investigation ? "current" : !f.investigationEnabled || (f.closed && !f.investigation) ? "skipped" : f.isDraft ? "todo" : "current",
    },
    { key: "ACTIONS", label: "Actions", state: actionsDone ? "done" : noActionNeeded || (f.closed && !hasActions) ? "skipped" : hasActions || status === "ACTION_REQUIRED" ? "current" : "todo" },
    {
      key: "EFFECTIVENESS",
      label: "Effectiveness",
      state: effectivenessDone ? "done" : noActionNeeded || (f.closed && !hasActions) ? "skipped" : actionsDone ? "current" : "todo",
    },
    { key: "CLOSED", label: "Closed", state: f.closed ? "done" : status === "READY_TO_CLOSE" ? "current" : "todo" },
  ];
  // Only one "current" – the earliest unfinished stage.
  let seenCurrent = false;
  for (const stage of stages) {
    if (stage.state !== "current") continue;
    if (seenCurrent) stage.state = "todo";
    seenCurrent = true;
  }
  return stages;
}

// ── Trends & prevention ─────────────────────────────────────────────────────

export interface TrendCriteria {
  from: string;
  to: string;
  typeId?: string | null;
  subtypeId?: string | null;
  causeId?: string | null;
  departmentId?: string | null;
}

export interface TrendCandidate {
  isDraft: boolean;
  archived: boolean;
  occurredAt: string | null;
  typeId: string;
  subtypeId: string | null;
  departmentId: string | null;
  causeIds: readonly string[];
}

export function trendCriteriaErrors(c: TrendCriteria): string[] {
  const out: string[] = [];
  if (!c.from || !c.to) out.push("Choose a date period.");
  else if (c.from > c.to) out.push("The period end is before its start.");
  if (!c.typeId && !c.subtypeId && !c.causeId) out.push("Choose at least a type, subtype or cause.");
  return out;
}

/** Active, submitted incidents in the period that match every chosen criterion (I-11). */
export function matchesTrend(i: TrendCandidate, c: TrendCriteria): boolean {
  if (i.isDraft || i.archived || !i.occurredAt) return false;
  const day = i.occurredAt.slice(0, 10);
  if (day < c.from || day > c.to) return false;
  if (c.typeId && i.typeId !== c.typeId) return false;
  if (c.subtypeId && i.subtypeId !== c.subtypeId) return false;
  if (c.departmentId && i.departmentId !== c.departmentId) return false;
  if (c.causeId && !i.causeIds.includes(c.causeId)) return false;
  return true;
}
