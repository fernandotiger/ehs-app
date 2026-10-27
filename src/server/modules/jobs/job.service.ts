import "server-only";
import { Prisma } from "@/generated/prisma/client";
import {
  DUE_WORK_KIND_INFO,
  JOB_RUN_HISTORY_LIMIT,
  type DueWorkKind,
  type JobRunsQuery,
  type JobRunTriggerKey,
  type ScheduledJobInput,
} from "@/lib/jobs";
import { PERMISSIONS } from "@/lib/permissions";
import type { ScopeTypeKey } from "@/lib/scope";
import type { Paginated } from "@/lib/validation/common";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ConflictError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { cleanName, requireCompanyConfig } from "@/server/modules/configuration/config-access";
import { resolveScope, scopeLabels } from "@/server/modules/configuration/scope-labels";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { requireTenantId } from "@/server/tenancy/context";
import {
  individualDedupeKey,
  localParts,
  matchJob,
  mergeDigestItems,
  planDigests,
  responsibleId,
  scheduleDue,
  type DigestItem,
  type EngineJob,
  type MatchedItem,
  type RoleHolder,
} from "./engine";
import { dueWorkProvider, jobTargetOptions, type JobTargetOption } from "./providers";
import type { DueWorkItem } from "./types";

/**
 * Scheduled jobs: CRUD, Test (evaluate, record, deliver nothing), Run now (deliver + MANUAL run,
 * works while paused) and the cron entry point `runDue` (per tenant). Delivery is in-app only
 * (notificationService); e-mail is shown as not connected and never claimed.
 */

export const JOB_ENTITY = "ScheduledJob";
export const JOB_NOTIFICATIONS = { REMINDER: "jobs.reminder", ESCALATION: "jobs.escalation", DIGEST: "jobs.digest" } as const;
const P = PERMISSIONS;
/** Matched items kept in a run's details. */
const RUN_ITEM_LIMIT = 200;

export interface JobDto extends ScheduledJobInput {
  id: string;
  scopeLabel: string;
  version: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunItemDto {
  provider: DueWorkKind;
  providerLabel: string;
  entityType: string;
  entityId: string;
  reference: string | null;
  title: string;
  href: string;
  dueDate: string;
  daysOverdue: number;
  responsible: string | null;
  siteName: string | null;
  recipients: string[];
  escalated: boolean;
}

export interface JobRunDto {
  id: string;
  jobId: string;
  jobName: string;
  trigger: JobRunTriggerKey;
  startedAt: string;
  finishedAt: string | null;
  timeZone: string;
  localDate: string;
  outcome: "COMPLETED" | "FAILED";
  matchedCount: number;
  deliveredCount: number;
  escalatedCount: number;
  explanation: string;
}

export interface JobRunDetailDto extends JobRunDto {
  items: JobRunItemDto[];
}

type JobRow = Prisma.ScheduledJobGetPayload<object>;
type RunRow = Prisma.JobRunGetPayload<object>;

function recipientsOf(row: JobRow): ScheduledJobInput["recipients"] {
  const r = (row.recipients ?? {}) as { owners?: boolean; roleIds?: string[] };
  return { owners: Boolean(r.owners), roleIds: Array.isArray(r.roleIds) ? r.roleIds : [] };
}

function escalationOf(row: JobRow): ScheduledJobInput["escalation"] {
  const e = row.escalation as { afterDays?: number; roleIds?: string[] } | null;
  return e && typeof e.afterDays === "number" ? { afterDays: e.afterDays, roleIds: Array.isArray(e.roleIds) ? e.roleIds : [] } : null;
}

function toInput(row: JobRow): ScheduledJobInput {
  return {
    name: row.name,
    kind: row.kind,
    targets: row.targets as DueWorkKind[],
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    frequency: row.frequency,
    weekday: row.weekday,
    dayOfMonth: row.dayOfMonth,
    runTime: row.runTime,
    timeZone: row.timeZone,
    overdueDays: row.overdueDays,
    upcomingDays: row.upcomingDays,
    recipients: recipientsOf(row),
    delivery: row.delivery,
    channels: row.channels as ScheduledJobInput["channels"],
    escalation: escalationOf(row),
    enabled: row.enabled,
  };
}

function toEngine(row: JobRow): EngineJob {
  return { id: row.id, ...toInput(row) };
}

function toDto(row: JobRow, scopeLabel: string): JobDto {
  return {
    id: row.id,
    ...toInput(row),
    scopeLabel,
    version: row.version,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function toDtos(db: DbClient, rows: JobRow[]): Promise<JobDto[]> {
  const labels = await scopeLabels(db, rows.map((r) => ({ scopeType: r.scopeType as ScopeTypeKey, scopeId: r.scopeId })));
  return rows.map((r) => toDto(r, labels.get(r.scopeType === "COMPANY" ? "COMPANY" : `${r.scopeType}:${r.scopeId}`) ?? "Whole company"));
}

function toRunDto(row: RunRow): JobRunDto {
  return {
    id: row.id,
    jobId: row.jobId,
    jobName: row.jobName,
    trigger: row.trigger,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    timeZone: row.timeZone,
    localDate: row.localDate,
    outcome: row.outcome,
    matchedCount: row.matchedCount,
    deliveredCount: row.deliveredCount,
    escalatedCount: row.escalatedCount,
    explanation: row.explanation,
  };
}

/** Roles and scope must exist in this tenant; "later" targets cannot be saved before their module exists. */
async function checkReferences(db: DbClient, input: ScheduledJobInput): Promise<void> {
  const roleIds = [...new Set([...input.recipients.roleIds, ...(input.escalation?.roleIds ?? [])])];
  if (roleIds.length) {
    const found = await db.role.count({ where: { id: { in: roleIds } } });
    if (found !== roleIds.length) throw new ValidationError("Choose existing roles.", [{ path: "recipients.roleIds", message: "Choose existing roles" }]);
  }
  if (input.scopeType !== "COMPANY") await resolveScope(db, { scopeType: input.scopeType, scopeId: input.scopeId });
  const unsupported = input.targets.filter((t) => DUE_WORK_KIND_INFO[t].later && !dueWorkProvider(t));
  if (unsupported.length) {
    throw new ValidationError(`${unsupported.map((t) => DUE_WORK_KIND_INFO[t].label).join(", ")} reminders come with their module.`, [{ path: "targets", message: "Not available yet" }]);
  }
}

function jobData(input: ScheduledJobInput) {
  return {
    name: cleanName(input.name),
    kind: input.kind,
    targets: [...new Set(input.targets)],
    scopeType: input.scopeType,
    scopeId: input.scopeType === "COMPANY" ? null : input.scopeId,
    frequency: input.frequency,
    weekday: input.frequency === "WEEKLY" ? input.weekday : null,
    dayOfMonth: input.frequency === "MONTHLY" ? input.dayOfMonth : null,
    runTime: input.runTime,
    timeZone: input.timeZone,
    overdueDays: input.overdueDays,
    upcomingDays: input.upcomingDays,
    recipients: { owners: input.recipients.owners, roleIds: [...new Set(input.recipients.roleIds)] },
    delivery: input.delivery,
    channels: [...new Set(input.channels)],
    escalation: input.kind === "OVERDUE" && input.escalation ? { afterDays: input.escalation.afterDays, roleIds: [...new Set(input.escalation.roleIds)] } : Prisma.DbNull,
    enabled: input.enabled,
  };
}

async function assertUniqueName(db: DbClient, name: string, excludeId?: string) {
  const clash = await db.scheduledJob.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  if (clash) throw new ConflictError(`A job called "${name}" already exists.`);
}

async function loadJob(db: DbClient, id: string): Promise<JobRow> {
  const row = await db.scheduledJob.findUnique({ where: { id } });
  if (!row) throw new NotFoundError();
  return row;
}

// ── Execution ───────────────────────────────────────────────────────────────

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (date: string) => DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function reminderText(job: EngineJob, match: MatchedItem, escalation: boolean) {
  const { item, daysOverdue, daysUntil } = match;
  const label = item.reference ? `${item.reference} · ${item.title}` : item.title;
  if (escalation) return { title: `Escalation: ${label}`, body: `Overdue by ${plural(daysOverdue, "day")} (due ${formatDate(item.dueDate)}). Sent to you as an escalation contact.` };
  if (daysOverdue > 0) return { title: `Overdue: ${label}`, body: `Was due on ${formatDate(item.dueDate)} – ${plural(daysOverdue, "day")} ago.` };
  if (job.kind === "UPCOMING" || daysUntil > 0) return { title: `Due soon: ${label}`, body: daysUntil === 0 ? "Due today." : `Due on ${formatDate(item.dueDate)} – in ${plural(daysUntil, "day")}.` };
  return { title: `Due today: ${label}`, body: "Due today." };
}

interface ExecutionResult {
  outcome: "COMPLETED" | "FAILED";
  matches: MatchedItem[];
  delivered: number;
  alreadySent: number;
  explanation: string;
}

async function collectItems(job: EngineJob, enabledModules: readonly string[]): Promise<{ items: DueWorkItem[]; unavailable: string[]; failed: string[] }> {
  const items: DueWorkItem[] = [];
  const unavailable: string[] = [];
  const failed: string[] = [];
  for (const kind of job.targets) {
    const provider = dueWorkProvider(kind);
    if (!provider || !enabledModules.includes(provider.module)) {
      unavailable.push(DUE_WORK_KIND_INFO[kind].label);
      continue;
    }
    try {
      items.push(...(await provider.listOpen()));
    } catch (error) {
      console.error(`[jobs] provider ${kind} failed`, error);
      failed.push(provider.label);
    }
  }
  return { items, unavailable, failed };
}

async function roleHolders(roleIds: string[]): Promise<RoleHolder[]> {
  if (!roleIds.length) return [];
  const rows = await prisma.roleAssignment.findMany({
    where: { roleId: { in: roleIds }, user: { isActive: true } },
    select: { userId: true, roleId: true, scopeType: true, scopeId: true },
  });
  return rows;
}

async function deliver(job: EngineJob, jobName: string, matches: MatchedItem[], date: string): Promise<{ delivered: number; attempted: number }> {
  let delivered = 0;
  let attempted = 0;
  if (job.delivery === "INDIVIDUAL") {
    for (const match of matches) {
      const regular = match.recipients.filter((id) => !match.escalationRecipients.includes(id));
      for (const [userIds, escalation] of [
        [regular, false],
        [match.escalationRecipients, true],
      ] as const) {
        if (!userIds.length) continue;
        attempted += userIds.length;
        const text = reminderText(job, match, escalation);
        delivered += await notificationService.notify({
          userIds: [...userIds],
          type: escalation ? JOB_NOTIFICATIONS.ESCALATION : JOB_NOTIFICATIONS.REMINDER,
          title: text.title,
          body: text.body,
          link: match.item.href,
          entityType: match.item.entityType,
          entityId: match.item.entityId,
          dedupeKeyFor: (userId) => individualDedupeKey(job.id, match.item, userId, date),
        });
      }
    }
    return { delivered, attempted };
  }
  for (const digest of planDigests(job.id, matches, date)) {
    attempted++;
    const result = await notificationService.upsertDigest({
      userId: digest.userId,
      type: JOB_NOTIFICATIONS.DIGEST,
      dedupeKey: digest.dedupeKey,
      link: "/my-work",
      build: (existing) => {
        const merged = mergeDigestItems((existing ?? []) as DigestItem[], digest.items);
        if (existing && merged.added === 0) return null;
        return { title: `${jobName}: ${plural(merged.items.length, "item")} for you`, body: `Open work as of ${formatDate(date)}.`, items: merged.items };
      },
    });
    if (result !== "unchanged") delivered++;
  }
  return { delivered, attempted };
}

function explain(job: EngineJob & { channels: readonly string[] }, trigger: JobRunTriggerKey, r: Omit<ExecutionResult, "explanation" | "outcome">, notes: { unavailable: string[]; failed: string[] }): string {
  const parts: string[] = [];
  const matched = r.matches.length;
  const escalated = r.matches.filter((m) => m.escalated).length;
  if (trigger === "TEST") {
    parts.push(`Test only – nothing was sent. ${matched ? `${plural(matched, "item")} match${matched === 1 ? "es" : ""} the saved rules.` : "No open work matches the saved rules."}`);
  } else if (!matched) {
    parts.push("No open work matched – nothing to send.");
  } else {
    const unit = job.delivery === "DIGEST" ? "digest" : "in-app reminder";
    parts.push(`${plural(matched, "item")} matched; ${plural(r.delivered, unit)} delivered.`);
    if (r.alreadySent > 0) parts.push(job.delivery === "DIGEST" ? `${plural(r.alreadySent, "digest")} already up to date for today.` : `${plural(r.alreadySent, "reminder")} already sent today (not repeated).`);
  }
  if (escalated) parts.push(`${plural(escalated, "item")} reached the escalation threshold.`);
  if (notes.unavailable.length) parts.push(`${notes.unavailable.join(", ")}: not available yet – nothing was checked for ${notes.unavailable.length === 1 ? "it" : "them"}.`);
  if (notes.failed.length) parts.push(`Could not read ${notes.failed.join(", ")}.`);
  if (job.channels.includes("EMAIL")) parts.push("Email is not connected – nothing was emailed.");
  return parts.join(" ");
}

async function runItems(matches: MatchedItem[]): Promise<JobRunItemDto[]> {
  const kept = matches.slice(0, RUN_ITEM_LIMIT);
  const userIds = [...new Set(kept.flatMap((m) => [...m.recipients, responsibleId(m.item) ?? ""]).filter(Boolean))];
  const siteIds = [...new Set(kept.map((m) => m.item.placement.siteId).filter((s): s is string => Boolean(s)))];
  const [users, sites] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    siteIds.length ? prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } }) : [],
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  return kept.map((m) => {
    const responsible = responsibleId(m.item);
    return {
      provider: m.item.provider,
      providerLabel: DUE_WORK_KIND_INFO[m.item.provider]?.label ?? m.item.provider,
      entityType: m.item.entityType,
      entityId: m.item.entityId,
      reference: m.item.reference ?? null,
      title: m.item.title,
      href: m.item.href,
      dueDate: m.item.dueDate,
      daysOverdue: m.daysOverdue,
      responsible: responsible ? (userName.get(responsible) ?? null) : null,
      siteName: m.item.placement.siteId ? (siteName.get(m.item.placement.siteId) ?? null) : null,
      recipients: m.recipients.map((id) => userName.get(id) ?? "Unknown person"),
      escalated: m.escalated,
    };
  });
}

async function trimHistory(): Promise<void> {
  const old = await prisma.jobRun.findMany({ select: { id: true }, orderBy: [{ startedAt: "desc" }, { id: "desc" }], skip: JOB_RUN_HISTORY_LIMIT, take: 1000 });
  if (old.length) await prisma.jobRun.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
}

/**
 * Evaluates the SAVED job now. TEST delivers nothing; MANUAL and SCHEDULED deliver in-app
 * messages (deduplicated per job, record, recipient and local day). Always records a run.
 */
async function execute(row: JobRow, trigger: JobRunTriggerKey, actor: CurrentUser | null, now = new Date()): Promise<JobRunDetailDto> {
  const job = toEngine(row);
  const startedAt = now;
  const today = localParts(now, job.timeZone).date;
  const org = await prisma.organization.findUnique({ where: { id: requireTenantId() }, select: { enabledModules: true } });
  const enabledModules = org?.enabledModules ?? [];

  let outcome: "COMPLETED" | "FAILED" = "COMPLETED";
  let matches: MatchedItem[] = [];
  let delivered = 0;
  let alreadySent = 0;
  let explanation: string;
  try {
    const { items, unavailable, failed } = await collectItems(job, enabledModules);
    const holders = await roleHolders([...new Set([...job.recipients.roleIds, ...(job.escalation?.roleIds ?? [])])]);
    matches = matchJob(job, items, holders, today);
    if (trigger !== "TEST" && matches.length) {
      const result = await deliver(job, row.name, matches, today);
      delivered = result.delivered;
      alreadySent = result.attempted - result.delivered;
    }
    if (failed.length) outcome = "FAILED";
    explanation = explain({ ...job, channels: row.channels }, trigger, { matches, delivered, alreadySent }, { unavailable, failed });
  } catch (error) {
    console.error(`[jobs] job ${row.id} failed`, error);
    outcome = "FAILED";
    explanation = `The run stopped with an error after ${plural(delivered, "delivery", "deliveries")}. Nothing else was sent.`;
  }

  const items = await runItems(matches);
  const run = await prisma.jobRun.create({
    data: {
      organizationId: row.organizationId,
      jobId: row.id,
      jobName: row.name,
      trigger,
      startedAt,
      finishedAt: new Date(),
      timeZone: job.timeZone,
      localDate: today,
      outcome,
      matchedCount: matches.length,
      deliveredCount: delivered,
      escalatedCount: matches.filter((m) => m.escalated).length,
      explanation,
      items: JSON.parse(JSON.stringify(items)) as Prisma.InputJsonValue,
      triggeredById: actor?.id ?? null,
    },
  });
  if (trigger !== "TEST") await prisma.scheduledJob.update({ where: { id: row.id }, data: { lastRunAt: startedAt } });
  await trimHistory();
  return { ...toRunDto(run), items };
}

// ── Service ─────────────────────────────────────────────────────────────────

export const jobService = {
  targets(user: CurrentUser): JobTargetOption[] {
    requireCompanyConfig(user, P.CONFIG_JOBS_VIEW);
    return jobTargetOptions(user.enabledModules);
  },

  async list(query: { q?: string; status?: "active" | "paused" | "all" }, user: CurrentUser): Promise<JobDto[]> {
    requireCompanyConfig(user, P.CONFIG_JOBS_VIEW);
    const rows = await prisma.scheduledJob.findMany({
      where: {
        ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
        ...(query.status === "active" ? { enabled: true } : query.status === "paused" ? { enabled: false } : {}),
      },
      orderBy: { name: "asc" },
    });
    return toDtos(prisma, rows);
  },

  async get(id: string, user: CurrentUser): Promise<JobDto> {
    requireCompanyConfig(user, P.CONFIG_JOBS_VIEW);
    return (await toDtos(prisma, [await loadJob(prisma, id)]))[0]!;
  },

  async create(input: ScheduledJobInput, user: CurrentUser, meta: RequestMeta): Promise<JobDto> {
    requireCompanyConfig(user, P.CONFIG_JOBS_MANAGE);
    const data = jobData(input);
    try {
      return await prisma.$transaction(async (tx) => {
        await assertUniqueName(tx, data.name);
        await checkReferences(tx, input);
        const row = await tx.scheduledJob.create({ data: { organizationId: user.organizationId, ...data, createdById: user.id } });
        await recordAudit({ entityType: JOB_ENTITY, entityId: row.id, action: "CREATED", actor: user, changes: { ...input, name: data.name }, meta }, tx);
        return (await toDtos(tx, [row]))[0]!;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(`A job called "${data.name}" already exists.`);
      throw error;
    }
  },

  async update(id: string, input: ScheduledJobInput & { expectedVersion: number }, user: CurrentUser, meta: RequestMeta): Promise<JobDto> {
    requireCompanyConfig(user, P.CONFIG_JOBS_MANAGE);
    const data = jobData(input);
    return prisma.$transaction(async (tx) => {
      const before = await loadJob(tx, id);
      if (data.name.toLowerCase() !== before.name.toLowerCase()) await assertUniqueName(tx, data.name, id);
      await checkReferences(tx, input);
      const updated = await tx.scheduledJob.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (updated.count === 0) throw new StaleVersionError("This job was changed by someone else – reload to see their changes.");
      await recordAudit({ entityType: JOB_ENTITY, entityId: id, action: "UPDATED", actor: user, changes: { from: toInput(before), to: { ...input, name: data.name } }, meta }, tx);
      return (await toDtos(tx, [await loadJob(tx, id)]))[0]!;
    });
  },

  /** Pause / resume scheduled execution (Test and Run now keep working while paused). */
  async setEnabled(id: string, enabled: boolean, user: CurrentUser, meta: RequestMeta): Promise<JobDto> {
    requireCompanyConfig(user, P.CONFIG_JOBS_MANAGE);
    return prisma.$transaction(async (tx) => {
      const before = await loadJob(tx, id);
      if (before.enabled !== enabled) {
        await tx.scheduledJob.update({ where: { id }, data: { enabled, version: { increment: 1 } } });
        await recordAudit({ entityType: JOB_ENTITY, entityId: id, action: enabled ? "RESUMED" : "PAUSED", actor: user, meta }, tx);
      }
      return (await toDtos(tx, [await loadJob(tx, id)]))[0]!;
    });
  },

  /** Evaluate the saved rules against current work and record a TEST run – delivers nothing. */
  async test(id: string, user: CurrentUser, meta: RequestMeta): Promise<JobRunDetailDto> {
    requireCompanyConfig(user, P.CONFIG_JOBS_TEST);
    const run = await execute(await loadJob(prisma, id), "TEST", user);
    await recordAudit({ entityType: JOB_ENTITY, entityId: id, action: "TESTED", actor: user, metadata: { runId: run.id, matched: run.matchedCount }, meta });
    return run;
  },

  /** Deliver now (MANUAL run). Works while paused; repeated runs on the same local day do not repeat reminders. */
  async runNow(id: string, user: CurrentUser, meta: RequestMeta): Promise<JobRunDetailDto> {
    requireCompanyConfig(user, P.CONFIG_JOBS_TEST);
    const run = await execute(await loadJob(prisma, id), "MANUAL", user);
    await recordAudit({ entityType: JOB_ENTITY, entityId: id, action: "RUN_MANUALLY", actor: user, metadata: { runId: run.id, matched: run.matchedCount, delivered: run.deliveredCount }, meta });
    return run;
  },

  /** Cron (inside forEachTenant): run every enabled job whose schedule is due. */
  async runDue(now = new Date()): Promise<{ checked: number; ran: number; failed: number }> {
    const jobs = await prisma.scheduledJob.findMany({ where: { enabled: true }, orderBy: { name: "asc" } });
    let ran = 0;
    let failed = 0;
    for (const row of jobs) {
      const today = localParts(now, row.timeZone).date;
      const done = await prisma.jobRun.findMany({
        where: { jobId: row.id, trigger: "SCHEDULED", outcome: "COMPLETED", localDate: today },
        select: { localDate: true },
        take: 1,
      });
      const check = scheduleDue(toEngine(row), now, new Set(done.map((d) => d.localDate)));
      if (!check.due) continue;
      const run = await execute(row, "SCHEDULED", null, now);
      ran++;
      if (run.outcome === "FAILED") failed++;
    }
    return { checked: jobs.length, ran, failed };
  },

  async runs(query: JobRunsQuery, user: CurrentUser): Promise<Paginated<JobRunDto>> {
    requireCompanyConfig(user, P.CONFIG_JOBS_VIEW);
    const where: Prisma.JobRunWhereInput = {
      ...(query.jobId ? { jobId: query.jobId } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.trigger ? { trigger: query.trigger } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.jobRun.findMany({ where, orderBy: [{ startedAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.jobRun.count({ where }),
    ]);
    return { items: rows.map(toRunDto), total, page: query.page, pageSize: query.pageSize };
  },

  async run(id: string, user: CurrentUser): Promise<JobRunDetailDto> {
    requireCompanyConfig(user, P.CONFIG_JOBS_VIEW);
    const row = await prisma.jobRun.findUnique({ where: { id } });
    if (!row) throw new NotFoundError();
    return { ...toRunDto(row), items: (row.items as unknown as JobRunItemDto[]) ?? [] };
  },
};
