/**
 * Pure acknowledgement rules: effective settings, due dates, per-user status and
 * reminder/escalation scheduling decisions. No I/O and no framework imports, so it is
 * unit-tested directly and can also be used by the seed script.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** How many days before the due date the first reminder goes out ("approaching"). */
export const REMINDER_LEAD_DAYS = 2;

export type EscalationTargetName = "MANAGER" | "HR" | "NONE";
export type MyAckStatus = "not_required" | "acknowledged" | "outstanding" | "overdue";

export interface EffectiveAckSettings {
  ackDueDays: number;
  reminderIntervalDays: number;
  escalationDays: number;
  escalationTarget: EscalationTargetName;
}

export interface AckSettingDefaults {
  defaultAckDueDays: number;
  defaultReminderIntervalDays: number;
  defaultEscalationDays: number;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/** Per-document values win; unset values fall back to the system settings. */
export function resolveAckSettings(
  document: { ackDueDays: number | null; reminderIntervalDays: number | null; escalationDays: number | null; escalationTarget: EscalationTargetName },
  defaults: AckSettingDefaults,
): EffectiveAckSettings {
  return {
    ackDueDays: document.ackDueDays ?? defaults.defaultAckDueDays,
    reminderIntervalDays: document.reminderIntervalDays ?? defaults.defaultReminderIntervalDays,
    escalationDays: document.escalationDays ?? defaults.defaultEscalationDays,
    escalationTarget: document.escalationTarget,
  };
}

/**
 * The moment the currently required version became the employee's obligation: the latest
 * of the document's publication, the creation of the version that (re)started the
 * requirement, and when acknowledgement was switched on for an already-published document.
 * Null when the document has never been published.
 */
export function requiredSince(
  publishedAt: Date | null,
  requiredVersionCreatedAt: Date | null,
  ackEnabledAt: Date | null = null,
): Date | null {
  if (!publishedAt) return null;
  let since = publishedAt;
  if (requiredVersionCreatedAt) since = maxDate(since, requiredVersionCreatedAt);
  if (ackEnabledAt) since = maxDate(since, ackEnabledAt);
  return since;
}

/** Due date per assignee = max(required-since, user joined) + due days. */
export function dueDateFor(since: Date, userCreatedAt: Date, ackDueDays: number): Date {
  return addDays(maxDate(since, userCreatedAt), ackDueDays);
}

/** True when an acknowledgement of `acknowledgedVersion` satisfies the current requirement. */
export function satisfiesRequirement(acknowledgedVersion: number | null | undefined, ackRequiredFromVersion: number | null): boolean {
  if (acknowledgedVersion === null || acknowledgedVersion === undefined) return false;
  return acknowledgedVersion >= (ackRequiredFromVersion ?? 1);
}

export function acknowledgementStatus(input: {
  requiresAcknowledgement: boolean;
  assigned: boolean;
  ackRequiredFromVersion: number | null;
  /** Highest version number the user has acknowledged, if any. */
  latestAcknowledgedVersion: number | null;
  dueAt: Date | null;
  now: Date;
}): MyAckStatus {
  if (!input.requiresAcknowledgement || !input.assigned) return "not_required";
  if (satisfiesRequirement(input.latestAcknowledgedVersion, input.ackRequiredFromVersion)) return "acknowledged";
  if (input.dueAt && input.now.getTime() > input.dueAt.getTime()) return "overdue";
  return "outstanding";
}

/**
 * SQL helper for overdue counts. A user is overdue when max(since, createdAt) + dueDays < now,
 * i.e. both `since < now - dueDays` (document-level) and `createdAt < now - dueDays`.
 * Returns the createdAt cut-off, or null when nobody can be overdue yet.
 */
export function overdueCreatedBefore(since: Date | null, ackDueDays: number, now: Date): Date | null {
  if (!since) return null;
  const cutoff = addDays(now, -ackDueDays);
  return since.getTime() < cutoff.getTime() ? cutoff : null;
}

/**
 * SQL pre-filter for the reminder job: only users whose reminder window has opened
 * (max(since, createdAt) + dueDays - lead <= now) can need any action.
 * Returns the createdAt upper bound, or null when the window has not opened for anyone.
 */
export function reminderWindowCreatedBefore(since: Date | null, ackDueDays: number, now: Date): Date | null {
  if (!since) return null;
  const bound = addDays(now, REMINDER_LEAD_DAYS - ackDueDays);
  return since.getTime() <= bound.getTime() ? bound : null;
}

export interface ReminderState {
  remindersSent: number;
  lastRemindedAt: Date | null;
  escalatedAt: Date | null;
}

export interface ReminderDecision {
  remind: boolean;
  escalate: boolean;
}

/**
 * Decide what the scheduler should do for one outstanding assignee:
 *  - remind: once the due date is within REMINDER_LEAD_DAYS (or passed), then every
 *    `reminderIntervalDays` while still outstanding;
 *  - escalate: exactly once, when overdue by at least `escalationDays` (and a target is set).
 */
export function decideReminder(input: { now: Date; dueAt: Date; settings: EffectiveAckSettings; state: ReminderState | null }): ReminderDecision {
  const { now, dueAt, settings } = input;
  const state = input.state ?? { remindersSent: 0, lastRemindedAt: null, escalatedAt: null };
  const t = now.getTime();

  const windowOpen = t >= addDays(dueAt, -REMINDER_LEAD_DAYS).getTime();
  const intervalElapsed = !state.lastRemindedAt || t >= addDays(state.lastRemindedAt, settings.reminderIntervalDays).getTime();
  const remind = windowOpen && intervalElapsed;

  const overdue = t > dueAt.getTime();
  const escalate =
    settings.escalationTarget !== "NONE" &&
    !state.escalatedAt &&
    overdue &&
    t >= addDays(dueAt, settings.escalationDays).getTime();

  return { remind, escalate };
}

export function progressPercent(acknowledged: number, required: number): number {
  if (required <= 0) return 0;
  return Math.min(100, Math.round((acknowledged / required) * 100));
}

/** The canonical, signed fields of an acknowledgement (HMAC via signRecord / seed). */
export interface AcknowledgementSigningFields {
  /** Tenant – signed so a row cannot be moved to another company undetected. */
  organizationId: string;
  documentId: string;
  documentTitle: string;
  versionId: string;
  versionNumber: number;
  userId: string;
  userName: string;
  userEmail: string;
  statement: string;
  acknowledgedAt: Date;
  clientAcknowledgedAt: Date | null;
  source: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export function acknowledgementSigningPayload(fields: AcknowledgementSigningFields): Record<string, unknown> {
  return {
    organizationId: fields.organizationId,
    documentId: fields.documentId,
    documentTitle: fields.documentTitle,
    versionId: fields.versionId,
    versionNumber: fields.versionNumber,
    userId: fields.userId,
    userName: fields.userName,
    userEmail: fields.userEmail,
    statement: fields.statement,
    acknowledgedAt: fields.acknowledgedAt.toISOString(),
    clientAcknowledgedAt: fields.clientAcknowledgedAt ? fields.clientAcknowledgedAt.toISOString() : null,
    source: fields.source,
    ipAddress: fields.ipAddress,
    userAgent: fields.userAgent,
  };
}
