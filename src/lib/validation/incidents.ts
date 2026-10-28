import { z } from "zod";
import {
  ACTION_KINDS,
  ACTION_STATES,
  DURATION_UNITS,
  INCIDENT_STATUSES,
  INVESTIGATION_STATUSES,
  INVOLVEMENTS,
  PERSON_TYPES,
  PRIORITIES,
  SEVERITIES,
} from "../incidents";
import { idSchema, optionalId, optionalText, paginationQuerySchema } from "./common";

/** Zod schemas shared by the incident screens and the API. Business gates live in workflow.ts. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const dateString = z.string().trim().regex(DATE, "Use a valid date");
const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || DATE.test(v), "Use a valid date");
/** ISO date-time (the browser converts the local value it shows). */
const optionalDateTime = z
  .string()
  .trim()
  .max(40)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Use a valid date and time");
const answers = z.record(z.string(), z.unknown()).default({});
const ids = (max: number) => z.array(idSchema).max(max).default([]);
const expectedVersion = z.number().int().min(1);

// ── Report ──────────────────────────────────────────────────────────────────

export const personInputSchema = z.object({
  /** May be blank in a draft; a submitted report needs a name or "Unknown". */
  name: z.string().trim().max(200).default(""),
  userId: optionalId,
  personType: z.enum(PERSON_TYPES).default("EMPLOYEE"),
  involvement: z.enum(INVOLVEMENTS).default("WITNESS"),
  injuryDetails: optionalText(2000),
  injuryType: optionalText(120),
  bodyPart: optionalText(120),
});
export type PersonInput = z.infer<typeof personInputSchema>;

const reportFields = {
  typeId: idSchema,
  subtypeId: optionalId,
  title: z.string().trim().max(200).default(""),
  narrative: optionalText(10000),
  occurredAt: optionalDateTime,
  severity: z.enum(SEVERITIES).default("MINOR"),
  departmentId: optionalId,
  preciseLocation: optionalText(200),
  shift: optionalText(120),
  investigationTargetDate: optionalDate,
  isConfidential: z.boolean().optional(),
  investigatorIds: ids(20),
  notifyUserIds: ids(50),
  people: z.array(personInputSchema).max(50).default([]),
  immediateAction: optionalText(5000),
  firstAid: optionalText(5000),
  nurseNotified: z.boolean().default(false),
  /** Custom answers of the captured Report questionnaire. */
  answers,
};

export const incidentCreateSchema = z.object({
  ...reportFields,
  /** Client-generated id (wizard / offline outbox) – replays return the same incident. */
  clientId: z.string().uuid().optional(),
  /** Published Report form version to capture (default: the type's bound form). */
  formVersionId: optionalId,
  /** true = submit now (all gates), false = save as draft (title only). */
  submit: z.boolean().default(false),
  /** Evidence uploaded in the wizard (two-phase uploads, purpose "evidence"). */
  evidenceUploadIds: ids(20),
  /** Report anonymously: chosen when the report is first saved and never changed afterwards. */
  anonymous: z.boolean().default(false),
});
export type IncidentCreateInput = z.infer<typeof incidentCreateSchema>;

export const incidentUpdateSchema = z.object({ ...reportFields, expectedVersion });
export type IncidentUpdateInput = z.infer<typeof incidentUpdateSchema>;

export const versionOnlySchema = z.object({ expectedVersion });
export const closeIncidentSchema = z.object({ note: z.string().trim().max(5000).default(""), expectedVersion });
export const reopenIncidentSchema = z.object({ reason: optionalText(2000), expectedVersion });

// ── Investigation ───────────────────────────────────────────────────────────

export const startInvestigationSchema = z.object({
  /** Published Investigation form version (default: the type's bound form). */
  formVersionId: optionalId,
  investigatorId: optionalId,
});

export const absenceInputSchema = z.object({
  startDate: z.string().trim().max(10).default(""),
  endDate: z.string().trim().max(10).default(""),
  kind: z.string().trim().min(1, "Choose the absence kind").max(120),
  note: optionalText(1000),
});
export type AbsenceInput = z.infer<typeof absenceInputSchema>;

export const investigationSaveSchema = z.object({
  expectedVersion,
  investigatorId: optionalId,
  answers,
  healthSafetyImpact: z.boolean().default(false),
  hazardGroup: optionalText(120),
  environmentalImpact: z.boolean().default(false),
  environmentalAspect: optionalText(120),
  environmentalDescription: optionalText(5000),
  environmentalDuration: z.number().finite().nullish(),
  environmentalDurationUnit: z.enum(DURATION_UNITS).nullish(),
  causeIds: ids(50),
  reportable: z.boolean().default(false),
  reporteeIds: ids(20),
  absences: z.array(absenceInputSchema).max(50).default([]),
  operatingHoursLost: z.number().finite().nullish(),
  actionsRequired: z.boolean().nullish(),
  closingDecision: optionalText(5000),
  /** true = complete (all gates), false = save in progress. */
  complete: z.boolean().default(false),
});
export type InvestigationSaveInput = z.infer<typeof investigationSaveSchema>;

// ── Actions & tasks ─────────────────────────────────────────────────────────

const actionFields = {
  description: z.string().trim().min(1, "Describe the action").max(2000),
  ownerId: idSchema,
  departmentId: optionalId,
  dueDate: dateString,
  priority: z.enum(PRIORITIES).default("NORMAL"),
  capaCategory: optionalText(120),
  reviewerId: optionalId,
  plannedReviewDate: optionalDate,
};

export const actionCreateSchema = z.object({
  ...actionFields,
  kind: z.enum(ACTION_KINDS).default("CORRECTIVE"),
  /** An ordinary corrective action needs at least one incident. */
  incidentIds: ids(50),
});
export type ActionCreateInput = z.infer<typeof actionCreateSchema>;

export const actionUpdateSchema = z.object({ ...actionFields, expectedVersion });
export type ActionUpdateInput = z.infer<typeof actionUpdateSchema>;

export const followUpCreateSchema = z.object(actionFields);
export type FollowUpCreateInput = z.infer<typeof followUpCreateSchema>;

export const actionLinkSchema = z.object({ incidentId: idSchema });

export const actionCompleteSchema = z.object({
  completionComment: z.string().trim().max(5000).default(""),
  reviewerId: optionalId,
  plannedReviewDate: optionalDate,
  expectedVersion,
});

export const actionReviewSchema = z.object({
  outcome: z.enum(["EFFECTIVE", "INEFFECTIVE"]),
  comment: z.string().trim().max(5000).default(""),
  expectedVersion,
});

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Enter a task title").max(300),
  ownerId: idSchema,
  departmentId: optionalId,
  dueDate: dateString,
  priority: z.enum(PRIORITIES).default("NORMAL"),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskCompleteSchema = z.object({ completionComment: z.string().trim().min(1, "Describe what was done").max(5000) });

// ── Trends ──────────────────────────────────────────────────────────────────

export const trendCriteriaSchema = z.object({
  from: dateString,
  to: dateString,
  typeId: optionalId,
  subtypeId: optionalId,
  causeId: optionalId,
  departmentId: optionalId,
});
export type TrendCriteriaInput = z.infer<typeof trendCriteriaSchema>;

export const trendActionSchema = z.object({
  criteria: trendCriteriaSchema,
  /** The selected matching incidents (become the action's associated incidents). */
  incidentIds: z.array(idSchema).min(1, "Select at least one incident").max(200),
  ...actionFields,
});
export type TrendActionInput = z.infer<typeof trendActionSchema>;

// ── Registers, reports ──────────────────────────────────────────────────────

const optionalFlag = z.enum(["true", "false"]).optional();

export const incidentListQuerySchema = paginationQuerySchema.extend({
  view: z.enum(["incidents", "investigations"]).default("incidents"),
  status: z.enum([...INCIDENT_STATUSES, "ACTIVE_WORK"]).optional(),
  investigationStatus: z.enum([...INVESTIGATION_STATUSES, "OVERDUE"]).optional(),
  typeId: optionalId,
  subtypeId: optionalId,
  severity: z.enum(SEVERITIES).optional(),
  siteId: optionalId,
  departmentId: optionalId,
  ownerId: optionalId,
  from: optionalDate,
  to: optionalDate,
  archived: z.enum(["active", "archived", "all"]).default("active"),
  mine: optionalFlag,
  sort: z.enum(["occurredAt", "reference", "status", "severity", "targetDate", "updatedAt", "title"]).default("occurredAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});
export type IncidentListQuery = z.infer<typeof incidentListQuerySchema>;

export const incidentExportQuerySchema = incidentListQuerySchema.omit({ page: true, pageSize: true });

export const actionListQuerySchema = paginationQuerySchema.extend({
  view: z.enum(["actions", "tasks"]).default("actions"),
  state: z.enum([...ACTION_STATES, "ACTIVE"]).optional(),
  kind: z.enum(ACTION_KINDS).optional(),
  siteId: optionalId,
  ownerId: optionalId,
  overdue: optionalFlag,
  mine: optionalFlag,
  /** Exclude actions already linked to this incident (link picker). */
  excludeIncidentId: optionalId,
  done: optionalFlag,
  sort: z.enum(["dueDate", "reference", "state", "priority", "updatedAt"]).default("dueDate"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ActionListQuery = z.infer<typeof actionListQuerySchema>;
export const actionExportQuerySchema = actionListQuerySchema.omit({ page: true, pageSize: true });

export const REPORT_KEYS = ["by-type", "by-cause", "days-lost", "actions", "incidents"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];
export const REPORT_LABELS: Record<ReportKey, string> = {
  "by-type": "Incidents by type and subtype",
  "by-cause": "Incidents by cause",
  "days-lost": "Calendar days lost by department",
  actions: "Action & task tracking",
  incidents: "Incident tracking",
};

export const reportQuerySchema = z.object({
  from: dateString,
  to: dateString,
  siteId: optionalId,
  format: z.enum(["json", "csv"]).default("json"),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

// ── Configuration ───────────────────────────────────────────────────────────

const typeName = z.string().trim().min(1, "Enter a name for the type").max(80, "Use at most 80 characters");

/** New type: name, first subtype and the forms; every other setting starts at the defaults. */
export const incidentTypeCreateSchema = z.object({
  name: typeName,
  subtype: z.string().trim().min(1, "Enter a first subtype").max(120),
  reportFormId: optionalId,
  investigationFormId: optionalId,
});
export type IncidentTypeCreateInput = z.infer<typeof incidentTypeCreateSchema>;

export const incidentTypeUpdateSchema = z
  .object({
    /** Rename (the key and existing incidents' labels never change). */
    name: typeName.optional(),
    isActive: z.boolean(),
    multipleInvestigators: z.boolean(),
    assignmentRequired: z.boolean(),
    investigationEnabled: z.boolean(),
    investigationRequired: z.boolean(),
    defaultConfidential: z.boolean(),
    attachmentsAllowed: z.boolean(),
    targetDays: z.number().int("Use a whole number of days").min(1, "At least 1 day").max(365, "At most 365 days"),
    reportFormId: optionalId,
    investigationFormId: optionalId,
    expectedVersion,
  })
  .refine((v) => !v.investigationRequired || v.investigationEnabled, { message: "An investigation can only be required when investigations are enabled", path: ["investigationRequired"] });
export type IncidentTypeUpdateInput = z.infer<typeof incidentTypeUpdateSchema>;

export const subtypeInputSchema = z.object({ name: z.string().trim().min(1, "Enter a subtype name").max(120) });
export const subtypeUpdateSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), isActive: z.boolean().optional() });
