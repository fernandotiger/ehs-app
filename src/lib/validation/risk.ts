import { z } from "zod";
import { ASSESSMENT_STATUSES, CHECKLIST_RESULTS, PROGRAMME_STATUSES, STRATEGY_STATUSES, TARGET_DIRECTIONS, TASK_KINDS, TASK_STATUSES } from "../risk/labels";
import { RISK_BANDS, RISK_METHODS } from "../risk/scoring";
import { idSchema, optionalId, optionalText, paginationQuerySchema } from "./common";

/** Zod schemas shared by the Risk screens and the API. Business gates live in src/server/modules/risk/{workflow,strategy}.ts. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const riskDate = z.string().trim().regex(DATE, "Use a valid date");
const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || DATE.test(v), "Use a valid date");
const ids = (max: number) => z.array(idSchema).max(max).default([]);
const expectedVersion = z.number().int().min(1);
const answers = z.record(z.string(), z.unknown()).default({});
const rating = z.number().int().min(0).max(10).nullish();

// ── Assessments ─────────────────────────────────────────────────────────────

export const hazardInputSchema = z.object({
  /** Existing hazard id (keeps linked tasks attached); omit for a new hazard. */
  id: optionalId,
  activity: z.string().trim().max(500).default(""),
  name: z.string().trim().max(300).default(""),
  consequence: z.string().trim().max(2000).default(""),
  controls: z.string().trim().max(5000).default(""),
  recommendation: optionalText(5000),
  justification: z.string().trim().max(2000).default(""),
  likelihood: rating,
  severity: rating,
  factors: z.record(z.string().max(40), z.number().int().min(1).max(10)).nullish(),
  checklistResult: z.enum(CHECKLIST_RESULTS).nullish(),
});
export type HazardInput = z.infer<typeof hazardInputSchema>;

export const ASSESSMENT_DECISIONS = ["draft", "submit", "approve"] as const;
export type AssessmentDecision = (typeof ASSESSMENT_DECISIONS)[number];

const assessmentFields = {
  title: z.string().trim().max(200).default(""),
  description: optionalText(5000),
  departmentId: optionalId,
  ownerId: optionalId,
  approverId: optionalId,
  reviewDate: optionalDate,
  participantIds: ids(50),
  itemType: optionalText(120),
  itemIdentity: optionalText(200),
  operationMode: optionalText(120),
  workArea: optionalText(120),
  peopleExposed: optionalText(2000),
  impactContext: optionalText(2000),
  isConfidential: z.boolean().optional(),
  hazards: z.array(hazardInputSchema).max(100).default([]),
  /** Custom answers of the captured Risk questionnaire. */
  answers,
  /** Save draft · Submit for approval · Save & approve. */
  decision: z.enum(ASSESSMENT_DECISIONS).default("draft"),
};

export const assessmentCreateSchema = z.object({
  ...assessmentFields,
  /** Published Risk form version to capture. */
  formVersionId: idSchema,
  /** Wizard-generated id – a retried request returns the same assessment. */
  clientId: z.string().uuid().optional(),
});
export type AssessmentCreateInput = z.infer<typeof assessmentCreateSchema>;

export const assessmentUpdateSchema = z.object({ ...assessmentFields, expectedVersion });
export type AssessmentUpdateInput = z.infer<typeof assessmentUpdateSchema>;

export const riskVersionSchema = z.object({ expectedVersion });
export const approveSchema = z.object({ expectedVersion, comment: optionalText(2000) });
export const historyQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });

export const periodicReviewSchema = z.object({
  reviewDate: z.string().trim().max(10).default(""),
  nextReviewDate: z.string().trim().max(10).default(""),
  comment: z.string().trim().max(5000).default(""),
  expectedVersion,
});
export type PeriodicReviewInput = z.infer<typeof periodicReviewSchema>;

export const relatedLinkSchema = z.object({ otherId: idSchema });

const optionalFlag = z.enum(["true", "false"]).optional();

export const assessmentListQuerySchema = paginationQuerySchema.extend({
  /** ACTIVE = everything except Archived (default). */
  status: z.enum([...ASSESSMENT_STATUSES, "ACTIVE", "ALL"]).default("ACTIVE"),
  siteId: optionalId,
  departmentId: optionalId,
  ownerId: optionalId,
  method: z.enum(RISK_METHODS).optional(),
  band: z.enum([...RISK_BANDS, "ATTENTION"]).optional(),
  review: z.enum(["overdue", "due"]).optional(),
  mine: optionalFlag,
  /** Exclude this assessment and require its site (related-assessment picker). */
  relatedTo: optionalId,
  sort: z.enum(["updatedAt", "reference", "title", "score", "reviewDate", "status"]).default("updatedAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});
export type AssessmentListQuery = z.infer<typeof assessmentListQuerySchema>;
export const assessmentExportQuerySchema = assessmentListQuerySchema.omit({ page: true, pageSize: true });

// ── Tasks ───────────────────────────────────────────────────────────────────

const taskFields = {
  title: z.string().trim().max(200).default(""),
  info: optionalText(5000),
  ownerId: optionalId,
  createdOn: optionalDate,
  dueDate: optionalDate,
  programmeId: optionalId,
  assessmentId: optionalId,
  hazardId: optionalId,
  /** Scoring factor key (top-level RA tasks only). */
  factor: optionalText(40),
  targetValue: z.number().int().min(0).max(10).nullish(),
};

export const taskCreateSchema = z.object({
  ...taskFields,
  kind: z.enum(TASK_KINDS),
  parentId: optionalId,
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z.object({ ...taskFields, expectedVersion });
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const taskCompleteSchema = z.object({
  comment: z.string().trim().max(5000).default(""),
  completedOn: z.string().trim().max(10).default(""),
  actualValue: z.number().int().min(0).max(10).nullish(),
  expectedVersion,
});
export type TaskCompleteInput = z.infer<typeof taskCompleteSchema>;

export const taskListQuerySchema = paginationQuerySchema.extend({
  /** ACTIVE = Open or In progress. */
  status: z.enum([...TASK_STATUSES, "ACTIVE"]).optional(),
  kind: z.enum(TASK_KINDS).optional(),
  siteId: optionalId,
  ownerId: optionalId,
  programmeId: optionalId,
  assessmentId: optionalId,
  overdue: optionalFlag,
  mine: optionalFlag,
  topLevel: optionalFlag,
  sort: z.enum(["dueDate", "reference", "status", "createdOn", "updatedAt"]).default("dueDate"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

// ── Objectives, targets, programmes ─────────────────────────────────────────

const objectiveFields = {
  title: z.string().trim().max(200).default(""),
  domain: optionalText(120),
  departmentId: optionalId,
  ownerId: optionalId,
  deadline: optionalDate,
  description: optionalText(5000),
  status: z.enum(STRATEGY_STATUSES).default("ACTIVE"),
};
export const objectiveCreateSchema = z.object(objectiveFields);
export const objectiveUpdateSchema = z.object({ ...objectiveFields, expectedVersion });
export type ObjectiveInput = z.infer<typeof objectiveCreateSchema>;

const finite = z.number().finite();
const targetFields = {
  objectiveId: optionalId,
  title: z.string().trim().max(200).default(""),
  ownerId: optionalId,
  deadline: optionalDate,
  direction: z.enum(TARGET_DIRECTIONS),
  unit: optionalText(60),
  baseline: finite,
  current: finite,
  goal: finite,
  status: z.enum(STRATEGY_STATUSES).default("ACTIVE"),
};
export const targetCreateSchema = z.object(targetFields);
export const targetUpdateSchema = z.object({ ...targetFields, expectedVersion });
export type TargetInput = z.infer<typeof targetCreateSchema>;

const programmeFields = {
  objectiveId: optionalId,
  title: z.string().trim().max(200).default(""),
  targetIds: ids(50),
  departmentId: optionalId,
  ownerId: optionalId,
  startDate: optionalDate,
  deadline: optionalDate,
  means: optionalText(5000),
  budget: z.number().finite().nullish().transform((v) => (v === undefined ? null : v)),
  status: z.enum(PROGRAMME_STATUSES).default("PLANNED"),
};
export const programmeCreateSchema = z.object(programmeFields);
export const programmeUpdateSchema = z.object({ ...programmeFields, expectedVersion });
export type ProgrammeInput = z.infer<typeof programmeCreateSchema>;

export const strategyListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["ACTIVE", "COMPLETED", "PLANNED", "OPEN"]).optional(),
  siteId: optionalId,
  objectiveId: optionalId,
  ownerId: optionalId,
});
export type StrategyListQuery = z.infer<typeof strategyListQuerySchema>;

// ── Reports ─────────────────────────────────────────────────────────────────

export const RISK_REPORT_KEYS = ["by-department", "by-hazard", "score-reductions", "review-coverage", "outstanding-strategy", "outstanding-tasks", "task-summary"] as const;
export type RiskReportKey = (typeof RISK_REPORT_KEYS)[number];
export const RISK_REPORT_LABELS: Record<RiskReportKey, string> = {
  "by-department": "Assessment counts by department",
  "by-hazard": "Assessments by hazard / aspect",
  "score-reductions": "Assessment score reductions",
  "review-coverage": "Periodic review coverage",
  "outstanding-strategy": "Outstanding objectives, targets & programmes",
  "outstanding-tasks": "Outstanding tasks",
  "task-summary": "Task summary",
};
/** What the date filter means for each report. */
export const RISK_REPORT_DATE_MEANING: Record<RiskReportKey, string> = {
  "by-department": "Assessments with an approval or rescoring in the period.",
  "by-hazard": "Assessments with an approval or rescoring in the period.",
  "score-reductions": "Assessments with an approval or rescoring in the period.",
  "review-coverage": "Periodic reviews recorded in the period.",
  "outstanding-strategy": "Deadlines in the period.",
  "outstanding-tasks": "Tasks created in the period.",
  "task-summary": "Tasks created in the period.",
};

export const riskReportQuerySchema = z
  .object({
    from: optionalDate,
    to: optionalDate,
    siteId: optionalId,
    format: z.enum(["json", "csv"]).default("json"),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "The period end is before its start", path: ["to"] });
export type RiskReportQuery = z.infer<typeof riskReportQuerySchema>;

export const scanQuerySchema = z.object({ qr: z.string().trim().max(300) });
