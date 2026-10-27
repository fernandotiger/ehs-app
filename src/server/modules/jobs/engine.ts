/**
 * Scheduled-job engine – pure functions (no database), unit-tested in engine.test.ts.
 *
 * - Dates: everything is compared as local calendar dates in the JOB's time zone. A due date of
 *   today is not overdue; the upcoming window is today … today + N inclusive.
 * - Scope: an item matches when the job scope covers its placement (department → location → site
 *   → business unit, denormalised on the item). Role recipients need an assignment of a selected
 *   role whose scope covers the item; a site assignment never covers another site.
 * - Dedupe keys: individual `job:<id>:<entityType>:<entityId>:<user>:<localDate>`,
 *   digest `job:<id>:digest:<user>:<localDate>` (re-runs add only new digest items).
 */
import type { DueWorkKind, JobDeliveryKey, JobFrequencyKey, JobKindKey } from "@/lib/jobs";
import { scopeCovers, type Placement, type ScopeRef, type ScopeTypeKey } from "@/lib/scope";
import type { DueWorkItem } from "./types";

export interface EngineJob {
  id: string;
  kind: JobKindKey;
  targets: readonly DueWorkKind[];
  scopeType: ScopeTypeKey;
  scopeId: string | null;
  frequency: JobFrequencyKey;
  weekday: number | null;
  dayOfMonth: number | null;
  runTime: string;
  timeZone: string;
  overdueDays: number;
  upcomingDays: number;
  recipients: { owners: boolean; roleIds: readonly string[] };
  delivery: JobDeliveryKey;
  escalation: { afterDays: number; roleIds: readonly string[] } | null;
  enabled: boolean;
}

/** An active user's role assignment (who could receive role-based reminders). */
export interface RoleHolder {
  userId: string;
  roleId: string;
  scopeType: ScopeTypeKey;
  scopeId: string | null;
}

// ── Local dates ─────────────────────────────────────────────────────────────

export interface LocalParts {
  /** yyyy-mm-dd */
  date: string;
  /** HH:mm (24h) */
  time: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  day: number;
  daysInMonth: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(now: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    weekday: WEEKDAYS[get("weekday")] ?? 0,
    day,
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

/** Local calendar date (yyyy-mm-dd) of an instant in a time zone. */
export function localDate(now: Date, timeZone: string): string {
  return localParts(now, timeZone).date;
}

function dateUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
}

/** Whole days from `from` to `to` (both yyyy-mm-dd); positive when `to` is later. */
export function dayDiff(from: string, to: string): number {
  return Math.round((dateUtc(to) - dateUtc(from)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(dateUtc(date) + days * 86_400_000).toISOString().slice(0, 10);
}

// ── Matching ────────────────────────────────────────────────────────────────

export function jobScope(job: Pick<EngineJob, "scopeType" | "scopeId">): ScopeRef {
  return { type: job.scopeType, id: job.scopeType === "COMPANY" ? null : job.scopeId };
}

/** The person a reminder is addressed to: the reviewer of the current step, else the owner. */
export function responsibleId(item: Pick<DueWorkItem, "ownerId" | "reviewerId">): string | null {
  return item.reviewerId ?? item.ownerId;
}

/** Date test for one item. `daysOverdue` > 0 means past due; `daysUntil` ≥ 0 means not yet due. */
export function dateMatch(job: Pick<EngineJob, "kind" | "overdueDays" | "upcomingDays">, dueDate: string, today: string): { matched: boolean; daysOverdue: number; daysUntil: number } {
  const daysOverdue = dayDiff(dueDate, today);
  const daysUntil = -daysOverdue;
  switch (job.kind) {
    case "OVERDUE":
      return { matched: daysOverdue >= Math.max(1, job.overdueDays), daysOverdue, daysUntil };
    case "UPCOMING":
      return { matched: daysUntil >= 0 && daysUntil <= job.upcomingDays, daysOverdue, daysUntil };
    case "DIGEST":
      // A digest summarises all eligible open work within its targets and scope.
      return { matched: true, daysOverdue, daysUntil };
  }
}

function covering(holders: readonly RoleHolder[], roleIds: readonly string[], placement: Placement): string[] {
  if (!roleIds.length) return [];
  return holders.filter((h) => roleIds.includes(h.roleId) && scopeCovers({ type: h.scopeType, id: h.scopeId }, placement)).map((h) => h.userId);
}

export interface MatchedItem {
  item: DueWorkItem;
  daysOverdue: number;
  daysUntil: number;
  escalated: boolean;
  /** Everyone who receives this item (owners/reviewer + role holders + escalation), de-duplicated. */
  recipients: string[];
  /** Recipients added only because of escalation. */
  escalationRecipients: string[];
}

/** Items of the job's targets, inside its scope, matching its date rule – with their recipients. */
export function matchJob(job: EngineJob, items: readonly DueWorkItem[], holders: readonly RoleHolder[], today: string): MatchedItem[] {
  const scope = jobScope(job);
  const matches: MatchedItem[] = [];
  for (const item of items) {
    if (!job.targets.includes(item.provider)) continue;
    if (!scopeCovers(scope, item.placement)) continue;
    const date = dateMatch(job, item.dueDate, today);
    if (!date.matched) continue;
    const escalated = job.kind === "OVERDUE" && Boolean(job.escalation) && date.daysOverdue >= job.escalation!.afterDays;
    const recipients: string[] = [];
    const add = (id: string | null | undefined) => {
      if (id && !recipients.includes(id)) recipients.push(id);
    };
    if (job.recipients.owners) add(responsibleId(item));
    covering(holders, job.recipients.roleIds, item.placement).forEach(add);
    const before = new Set(recipients);
    const escalationRecipients: string[] = [];
    if (escalated) {
      for (const id of covering(holders, job.escalation!.roleIds, item.placement)) {
        add(id);
        if (!before.has(id) && !escalationRecipients.includes(id)) escalationRecipients.push(id);
      }
    }
    matches.push({ item, daysOverdue: date.daysOverdue, daysUntil: date.daysUntil, escalated, recipients, escalationRecipients });
  }
  return matches.sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate) || a.item.title.localeCompare(b.item.title));
}

// ── Deliveries ──────────────────────────────────────────────────────────────

export function individualDedupeKey(jobId: string, item: Pick<DueWorkItem, "entityType" | "entityId">, userId: string, date: string): string {
  return `job:${jobId}:${item.entityType}:${item.entityId}:${userId}:${date}`;
}

export function digestDedupeKey(jobId: string, userId: string, date: string): string {
  return `job:${jobId}:digest:${userId}:${date}`;
}

export interface DigestItem {
  title: string;
  link: string;
  entityType: string;
  entityId: string;
  dueDate: string;
  reference?: string;
}

export interface IndividualDelivery {
  userId: string;
  dedupeKey: string;
  match: MatchedItem;
  /** The user receives it because of escalation. */
  escalation: boolean;
}

export interface DigestDelivery {
  userId: string;
  dedupeKey: string;
  items: DigestItem[];
}

export function toDigestItem(item: DueWorkItem): DigestItem {
  return {
    title: item.reference ? `${item.reference} · ${item.title}` : item.title,
    link: item.href,
    entityType: item.entityType,
    entityId: item.entityId,
    dueDate: item.dueDate,
    ...(item.reference ? { reference: item.reference } : {}),
  };
}

/** One message per record and recipient. */
export function planIndividual(jobId: string, matches: readonly MatchedItem[], date: string): IndividualDelivery[] {
  return matches.flatMap((match) =>
    match.recipients.map((userId) => ({
      userId,
      dedupeKey: individualDedupeKey(jobId, match.item, userId, date),
      match,
      escalation: match.escalationRecipients.includes(userId),
    })),
  );
}

/** One grouped message per recipient (items de-duplicated per record). */
export function planDigests(jobId: string, matches: readonly MatchedItem[], date: string): DigestDelivery[] {
  const byUser = new Map<string, DigestItem[]>();
  for (const match of matches) {
    for (const userId of match.recipients) {
      const list = byUser.get(userId) ?? [];
      byUser.set(userId, mergeDigestItems(list, [toDigestItem(match.item)]).items);
    }
  }
  return [...byUser.entries()].map(([userId, items]) => ({ userId, dedupeKey: digestDedupeKey(jobId, userId, date), items }));
}

const digestKey = (i: Pick<DigestItem, "entityType" | "entityId">) => `${i.entityType}:${i.entityId}`;

/** Adds only records not yet in the digest. `added` = 0 means the digest is unchanged. */
export function mergeDigestItems(existing: readonly DigestItem[], incoming: readonly DigestItem[]): { items: DigestItem[]; added: number } {
  const keys = new Set(existing.map(digestKey));
  const items = [...existing];
  let added = 0;
  for (const item of incoming) {
    const key = digestKey(item);
    if (keys.has(key)) continue;
    keys.add(key);
    items.push(item);
    added++;
  }
  return { items, added };
}

// ── Schedule ────────────────────────────────────────────────────────────────

export interface ScheduleCheck {
  due: boolean;
  localDate: string;
  reason: "due" | "paused" | "before-run-time" | "not-scheduled-today" | "already-ran-today";
}

/** Whether the frequency includes this local day (monthly days past month end run on the last day). */
export function frequencyMatches(job: Pick<EngineJob, "frequency" | "weekday" | "dayOfMonth">, parts: LocalParts): boolean {
  switch (job.frequency) {
    case "DAILY":
      return true;
    case "WEEKDAYS":
      return parts.weekday >= 1 && parts.weekday <= 5;
    case "WEEKLY":
      return parts.weekday === (job.weekday ?? 1);
    case "MONTHLY":
      return parts.day === Math.min(job.dayOfMonth ?? 1, parts.daysInMonth);
  }
}

/**
 * Scheduled execution gate: enabled, local run time passed, frequency matches the local day and no
 * successful SCHEDULED run on that local day (`scheduledSuccessDates` = local dates of such runs).
 * Manual runs and tests do not count.
 */
export function scheduleDue(job: EngineJob, now: Date, scheduledSuccessDates: ReadonlySet<string>): ScheduleCheck {
  const parts = localParts(now, job.timeZone);
  const result = (due: boolean, reason: ScheduleCheck["reason"]): ScheduleCheck => ({ due, localDate: parts.date, reason });
  if (!job.enabled) return result(false, "paused");
  if (parts.time < job.runTime) return result(false, "before-run-time");
  if (!frequencyMatches(job, parts)) return result(false, "not-scheduled-today");
  if (scheduledSuccessDates.has(parts.date)) return result(false, "already-ran-today");
  return result(true, "due");
}

// ── My work ─────────────────────────────────────────────────────────────────

export type MyWorkGroup = "overdue" | "week" | "later";

/** Overdue (before today), due this week (today … today + 6) or later. */
export function myWorkGroup(dueDate: string, today: string): MyWorkGroup {
  const days = dayDiff(today, dueDate);
  if (days < 0) return "overdue";
  return days <= 6 ? "week" : "later";
}
