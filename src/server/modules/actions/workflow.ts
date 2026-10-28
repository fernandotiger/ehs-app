/**
 * Standalone action lifecycle – pure state machine + guards (tested in workflow.test.ts).
 * Every guard returns plain-words lines; services answer 422 BUSINESS_RULE_VIOLATION with
 * `details.blockers`. Safe for client components.
 *
 *   To do ──start──▶ In progress ──complete──▶ Completed
 *     └──────────────complete──────────────────▲
 *   To do / In progress ──cancel──▶ Cancelled
 *   Completed / Cancelled ──reopen──▶ To do
 *
 * Overdue is not a state: open work whose due date is before today (company-local).
 */
import { ACTION_STATUS_LABELS, isActiveStatus, type ActionStatusKey } from "@/lib/actions";

export { isActionOverdue, isActiveStatus } from "@/lib/actions";

export type ActionCommand = "start" | "complete" | "cancel" | "reopen";

const TRANSITIONS: Record<ActionCommand, { from: readonly ActionStatusKey[]; to: ActionStatusKey }> = {
  start: { from: ["OPEN"], to: "IN_PROGRESS" },
  complete: { from: ["OPEN", "IN_PROGRESS"], to: "COMPLETED" },
  cancel: { from: ["OPEN", "IN_PROGRESS"], to: "CANCELLED" },
  reopen: { from: ["COMPLETED", "CANCELLED"], to: "OPEN" },
};

export function canTransition(status: ActionStatusKey, command: ActionCommand): boolean {
  return TRANSITIONS[command].from.includes(status);
}

export function transitionTarget(command: ActionCommand): ActionStatusKey {
  return TRANSITIONS[command].to;
}

/** Statuses a command may start from (for guarded updateMany). */
export function transitionSources(command: ActionCommand): ActionStatusKey[] {
  return [...TRANSITIONS[command].from];
}

const COMMAND_BLOCKER: Record<ActionCommand, (status: ActionStatusKey) => string> = {
  start: (s) => `Only an action that is to do can be started (it is ${ACTION_STATUS_LABELS[s].toLowerCase()}).`,
  complete: (s) => `The action is already ${ACTION_STATUS_LABELS[s].toLowerCase()}.`,
  cancel: (s) => `The action is already ${ACTION_STATUS_LABELS[s].toLowerCase()}.`,
  reopen: () => "Only a completed or cancelled action can be reopened.",
};

export function commandBlockers(status: ActionStatusKey, command: ActionCommand): string[] {
  return canTransition(status, command) ? [] : [COMMAND_BLOCKER[command](status)];
}

// ── Save gates (create / edit) ──────────────────────────────────────────────

export const TITLE_MAX = 200;

export interface ActionDraftFacts {
  title: string;
  ownerId: string | null;
  dueDate: string | null;
  /** Company-local today (yyyy-mm-dd). */
  today: string;
  /** Edit only: the day the action was created (company-local); the due date may not be earlier. */
  createdOn?: string | null;
  /** Edit only: the due date already saved (an unchanged past due date stays valid). */
  currentDueDate?: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function saveBlockers(f: ActionDraftFacts): string[] {
  const out: string[] = [];
  if (!f.title.trim()) out.push("Enter a title – what needs to be done.");
  else if (f.title.trim().length > TITLE_MAX) out.push(`Keep the title to ${TITLE_MAX} characters.`);
  if (!f.ownerId) out.push("Choose who will do it.");
  if (!f.dueDate || !DATE.test(f.dueDate)) out.push("Choose a due date.");
  else if (f.createdOn === undefined) {
    if (f.dueDate < f.today) out.push("The due date cannot be in the past.");
  } else if (f.dueDate !== f.currentDueDate && f.createdOn && f.dueDate < f.createdOn) {
    out.push("The due date cannot be before the day the action was created.");
  }
  return out;
}

// ── Completion and cancellation ─────────────────────────────────────────────

export interface CompletionFacts {
  status: ActionStatusKey;
  notes: string;
  completedOn: string | null;
  createdOn: string;
  today: string;
}

export function completionBlockers(f: CompletionFacts): string[] {
  const out = commandBlockers(f.status, "complete");
  if (!f.notes.trim()) out.push("Say what was done.");
  if (!f.completedOn || !DATE.test(f.completedOn)) out.push("Enter the date it was done.");
  else if (f.completedOn > f.today) out.push("The completion date cannot be in the future.");
  else if (f.completedOn < f.createdOn) out.push("The completion date cannot be before the action was created.");
  return out;
}

export function cancelBlockers(f: { status: ActionStatusKey; reason: string }): string[] {
  const out = commandBlockers(f.status, "cancel");
  if (!f.reason.trim()) out.push("Say why the action is cancelled.");
  return out;
}

// ── Next step (ONE primary button) and stepper ──────────────────────────────

export interface ActionRights {
  /** Owner or manager: start / complete. */
  work: boolean;
  /** Creator or manager: reopen. */
  reopen: boolean;
}

/** The single next lifecycle step offered as the primary button, or null. */
export function nextStep(status: ActionStatusKey, rights: ActionRights): ActionCommand | null {
  if (status === "OPEN") return rights.work ? "start" : null;
  if (status === "IN_PROGRESS") return rights.work ? "complete" : null;
  return rights.reopen ? "reopen" : null;
}

export interface LifecycleStep {
  key: ActionStatusKey;
  label: string;
  state: "done" | "current" | "todo";
}

/** To do → In progress → Completed; a cancelled action shows Cancelled as its last step. */
export function lifecycle(status: ActionStatusKey, started: boolean): LifecycleStep[] {
  const last: ActionStatusKey = status === "CANCELLED" ? "CANCELLED" : "COMPLETED";
  const keys: ActionStatusKey[] = ["OPEN", "IN_PROGRESS", last];
  const index = status === "OPEN" ? 0 : status === "IN_PROGRESS" ? 1 : 2;
  return keys
    .filter((k) => !(k === "IN_PROGRESS" && status === "CANCELLED" && !started))
    .map((key) => {
      const i = keys.indexOf(key);
      return { key, label: ACTION_STATUS_LABELS[key], state: i < index ? "done" : i === index ? (isActiveStatus(status) ? "current" : "done") : "todo" };
    });
}
