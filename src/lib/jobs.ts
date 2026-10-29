/**
 * Scheduled jobs – shared vocabulary and validation (client + server).
 * Engine: src/server/modules/jobs/engine.ts. Providers: src/server/modules/jobs/providers.ts.
 */
import { z } from "zod";
import type { ModuleKey } from "./modules";
import { SCOPE_TYPES } from "./scope";

/** Kinds of due work. Open list: a module adds its kind here and registers a provider. */
export const DUE_WORK_KINDS = [
  "risk.review",
  "risk.task",
  "incident.investigation",
  "incident.action",
  "audit",
  "inspection",
  "law.evaluation",
  "law.task",
  "document.acknowledgement",
  "document.survey",
  "action",
  "slaw.action",
] as const;
export type DueWorkKind = (typeof DUE_WORK_KINDS)[number];

export interface DueWorkKindDescriptor {
  kind: DueWorkKind;
  label: string;
  module: ModuleKey;
  /** Not built yet – shown as "later" in the job editor. */
  later?: boolean;
}

export const DUE_WORK_KIND_INFO: Record<DueWorkKind, DueWorkKindDescriptor> = {
  "risk.review": { kind: "risk.review", label: "Risk reviews", module: "risk" },
  "risk.task": { kind: "risk.task", label: "Risk tasks", module: "risk" },
  "incident.investigation": { kind: "incident.investigation", label: "Incident investigations", module: "incidents" },
  "incident.action": { kind: "incident.action", label: "Incident actions", module: "incidents" },
  audit: { kind: "audit", label: "Audits", module: "audits", later: true },
  inspection: { kind: "inspection", label: "Inspections", module: "inspections", later: true },
  "law.evaluation": { kind: "law.evaluation", label: "Law evaluation reviews", module: "law" },
  "law.task": { kind: "law.task", label: "Law tasks", module: "law" },
  "document.acknowledgement": { kind: "document.acknowledgement", label: "Document acknowledgements", module: "documents" },
  action: { kind: "action", label: "Actions", module: "actions" },
  "document.survey": { kind: "document.survey", label: "Employee inductions", module: "documents" },
  "slaw.action": { kind: "slaw.action", label: "Simplified law actions", module: "simplified-law" },
};

export const JOB_KINDS = ["OVERDUE", "UPCOMING", "DIGEST"] as const;
export type JobKindKey = (typeof JOB_KINDS)[number];
export const JOB_KIND_LABELS: Record<JobKindKey, string> = {
  OVERDUE: "Overdue reminders",
  UPCOMING: "Upcoming due dates",
  DIGEST: "EHS summary digest",
};
export const JOB_KIND_HINTS: Record<JobKindKey, string> = {
  OVERDUE: "Remind people about work that is past its due date.",
  UPCOMING: "Warn people before work falls due.",
  DIGEST: "Summarise all open work in one regular message.",
};

export const JOB_FREQUENCIES = ["DAILY", "WEEKDAYS", "WEEKLY", "MONTHLY"] as const;
export type JobFrequencyKey = (typeof JOB_FREQUENCIES)[number];
export const JOB_FREQUENCY_LABELS: Record<JobFrequencyKey, string> = {
  DAILY: "Every day",
  WEEKDAYS: "Weekdays (Monday to Friday)",
  WEEKLY: "Once a week",
  MONTHLY: "Once a month",
};

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const JOB_DELIVERIES = ["INDIVIDUAL", "DIGEST"] as const;
export type JobDeliveryKey = (typeof JOB_DELIVERIES)[number];
export const JOB_DELIVERY_LABELS: Record<JobDeliveryKey, string> = {
  INDIVIDUAL: "One message per record",
  DIGEST: "One grouped message per person",
};

export const JOB_CHANNELS = ["IN_APP", "EMAIL"] as const;
export type JobChannel = (typeof JOB_CHANNELS)[number];

export const JOB_RUN_TRIGGERS = ["TEST", "MANUAL", "SCHEDULED"] as const;
export type JobRunTriggerKey = (typeof JOB_RUN_TRIGGERS)[number];
export const JOB_RUN_TRIGGER_LABELS: Record<JobRunTriggerKey, string> = { TEST: "Test", MANUAL: "Run now", SCHEDULED: "Scheduled" };

export const JOB_RUN_OUTCOMES = ["COMPLETED", "FAILED"] as const;
export type JobRunOutcomeKey = (typeof JOB_RUN_OUTCOMES)[number];

/** Recent run history kept per tenant. */
export const JOB_RUN_HISTORY_LIMIT = 500;

export const COMMON_TIME_ZONES = ["Europe/Dublin", "Europe/London", "Europe/Berlin", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Singapore", "Australia/Sydney", "UTC"];

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const id = z.string().min(1).max(64);

const jobBaseSchema = z.object({
  name: z.string().trim().min(1, "Enter a job name").max(80, "Use at most 80 characters"),
  kind: z.enum(JOB_KINDS),
  targets: z.array(z.enum(DUE_WORK_KINDS)).max(DUE_WORK_KINDS.length),
  scopeType: z.enum(SCOPE_TYPES),
  scopeId: id.nullable(),
  frequency: z.enum(JOB_FREQUENCIES),
  weekday: z.number().int().min(0).max(6).nullable(),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  runTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time such as 08:00"),
  timeZone: z.string().min(1).max(64),
  overdueDays: z.number().int().min(1, "At least 1 day (a due date of today is not overdue)").max(365),
  upcomingDays: z.number().int().min(0).max(365),
  recipients: z.object({ owners: z.boolean(), roleIds: z.array(id).max(50) }),
  delivery: z.enum(JOB_DELIVERIES),
  channels: z.array(z.enum(JOB_CHANNELS)).max(JOB_CHANNELS.length),
  escalation: z.object({ afterDays: z.number().int().min(1).max(365), roleIds: z.array(id).max(50) }).nullable(),
  enabled: z.boolean(),
});

export type ScheduledJobInput = z.infer<typeof jobBaseSchema>;

/** Save rules (spec J-09): name, ≥1 work type, in-app delivery, a recipient route, sane escalation. */
function refineJob(job: ScheduledJobInput, ctx: z.RefinementCtx) {
  if (job.targets.length === 0) ctx.addIssue({ code: "custom", path: ["targets"], message: "Choose at least one type of work to check" });
  if (!job.channels.includes("IN_APP")) ctx.addIssue({ code: "custom", path: ["channels"], message: "In-app delivery is required" });
  if (!job.recipients.owners && job.recipients.roleIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["recipients"], message: "Choose who is notified: assigned owners and/or at least one role" });
  }
  if (!isValidTimeZone(job.timeZone)) ctx.addIssue({ code: "custom", path: ["timeZone"], message: "Choose a valid time zone" });
  if (job.scopeType !== "COMPANY" && !job.scopeId) ctx.addIssue({ code: "custom", path: ["scopeId"], message: "Choose where this job applies" });
  if (job.frequency === "WEEKLY" && job.weekday === null) ctx.addIssue({ code: "custom", path: ["weekday"], message: "Choose the day of the week" });
  if (job.frequency === "MONTHLY" && job.dayOfMonth === null) ctx.addIssue({ code: "custom", path: ["dayOfMonth"], message: "Choose the day of the month" });
  if (job.escalation) {
    if (job.kind !== "OVERDUE") ctx.addIssue({ code: "custom", path: ["escalation"], message: "Escalation is only available for overdue reminders" });
    if (job.escalation.roleIds.length === 0) ctx.addIssue({ code: "custom", path: ["escalation", "roleIds"], message: "Choose the role to escalate to" });
    if (job.escalation.afterDays < job.overdueDays) {
      ctx.addIssue({ code: "custom", path: ["escalation", "afterDays"], message: "Escalation cannot start before the first overdue reminder" });
    }
  }
}

export const scheduledJobInputSchema = jobBaseSchema.superRefine(refineJob);
export const scheduledJobUpdateSchema = jobBaseSchema.extend({ expectedVersion: z.number().int().min(1) }).superRefine(refineJob);

export const jobEnabledSchema = z.object({ enabled: z.boolean() });

export const jobRunsQuerySchema = z.object({
  jobId: z.string().max(64).optional(),
  outcome: z.enum(JOB_RUN_OUTCOMES).optional(),
  trigger: z.enum(JOB_RUN_TRIGGERS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type JobRunsQuery = z.infer<typeof jobRunsQuerySchema>;

export function defaultJobInput(timeZone = "Europe/Dublin"): ScheduledJobInput {
  return {
    name: "",
    kind: "OVERDUE",
    targets: [],
    scopeType: "COMPANY",
    scopeId: null,
    frequency: "DAILY",
    weekday: 1,
    dayOfMonth: 1,
    runTime: "08:00",
    timeZone,
    overdueDays: 1,
    upcomingDays: 7,
    recipients: { owners: true, roleIds: [] },
    delivery: "INDIVIDUAL",
    channels: ["IN_APP"],
    escalation: null,
    enabled: true,
  };
}

/** "Every day at 08:00 (Europe/Dublin)" */
export function scheduleLabel(job: Pick<ScheduledJobInput, "frequency" | "weekday" | "dayOfMonth" | "runTime" | "timeZone">): string {
  const when =
    job.frequency === "DAILY"
      ? "Every day"
      : job.frequency === "WEEKDAYS"
        ? "Monday to Friday"
        : job.frequency === "WEEKLY"
          ? `Every ${WEEKDAY_LABELS[job.weekday ?? 1]}`
          : `Day ${job.dayOfMonth ?? 1} of each month`;
  return `${when} at ${job.runTime} (${job.timeZone})`;
}
