import { z } from "zod";
import { LAW_ACTIVITIES, LAW_LINK_TARGETS, LAW_TASK_PRIORITIES, REQUIREMENT_VIEWS, EVALUATION_STATUSES } from "../law";
import { idSchema, optionalId, paginationQuerySchema } from "./common";

/** Zod schemas shared by the Law screens and the API. Business gates live in src/server/modules/law/workflow.ts. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const expectedVersion = z.number().int().min(1);
const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || DATE.test(v), "Use a valid date");

const answers = z.record(z.string(), z.unknown()).default({});
const keywordList = z
  .union([z.string().max(1000), z.array(z.string().max(80)).max(30)])
  .default([])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((k) => k.trim()).filter(Boolean).slice(0, 30));

// ── Profiles ────────────────────────────────────────────────────────────────

const profileFields = {
  name: z.string().trim().max(120, "Use at most 120 characters").default(""),
  description: z.string().trim().max(2000, "Use at most 2000 characters").default(""),
  ownerId: optionalId,
  jurisdiction: z.string().trim().max(80).default(""),
  activities: z.array(z.enum(LAW_ACTIVITIES)).max(LAW_ACTIVITIES.length).default([]),
  isShared: z.boolean().default(true),
  showRating: z.boolean().default(true),
};

export const lawProfileCreateSchema = z.object({ ...profileFields, siteId: optionalId });
export type LawProfileCreateInput = z.infer<typeof lawProfileCreateSchema>;

/** The site is fixed after creation (requirements, departments and tasks belong to it). */
export const lawProfileUpdateSchema = z.object({ ...profileFields, expectedVersion });
export type LawProfileUpdateInput = z.infer<typeof lawProfileUpdateSchema>;

export const lawVersionSchema = z.object({ expectedVersion });

export const lawAcceptSchema = z.object({ version: z.string().trim().min(1).max(20), expectedVersion });
export type LawAcceptInput = z.infer<typeof lawAcceptSchema>;

// ── Requirements (evaluation) ───────────────────────────────────────────────

export const lawEvaluationSchema = z.object({
  relevanceNotes: z.string().trim().max(5000, "Use at most 5000 characters").default(""),
  evaluationNotes: z.string().trim().max(5000, "Use at most 5000 characters").default(""),
  /** Optional self-assessed rating 0–100; null clears it. */
  rating: z.number().nullable().default(null),
  ownerId: optionalId,
  departmentId: optionalId,
  nextReviewDate: optionalDate,
  confirmReviewed: z.boolean().default(false),
  /** Published Law form version (extra questions) – captured on the first save that sends it. */
  formVersionId: optionalId,
  answers,
  expectedVersion,
});
export type LawEvaluationInput = z.infer<typeof lawEvaluationSchema>;

export const lawExcludeSchema = z.object({ reason: z.string().trim().max(2000, "Use at most 2000 characters").default(""), expectedVersion });
export type LawExcludeInput = z.infer<typeof lawExcludeSchema>;

const otherFields = {
  title: z.string().trim().max(200, "Use at most 200 characters").default(""),
  requirementText: z.string().trim().max(5000, "Use at most 5000 characters").default(""),
  category: z.string().trim().max(80).default(""),
  keywords: keywordList,
};

export const lawOtherCreateSchema = z.object({ ...otherFields, profileId: idSchema });
export type LawOtherCreateInput = z.infer<typeof lawOtherCreateSchema>;

export const lawOtherUpdateSchema = z.object({ ...otherFields, expectedVersion });
export type LawOtherUpdateInput = z.infer<typeof lawOtherUpdateSchema>;

export const lawLinkCreateSchema = z.object({
  targetType: z.enum(LAW_LINK_TARGETS),
  targetId: optionalId,
  context: z.string().trim().max(500, "Use at most 500 characters").default(""),
});
export type LawLinkCreateInput = z.infer<typeof lawLinkCreateSchema>;

export const lawLinkOptionsQuerySchema = z.object({
  targetType: z.enum(LAW_LINK_TARGETS),
  q: z.string().trim().max(100).optional(),
});

export const lawRaiseIncidentSchema = z.object({
  departmentId: optionalId,
  /** Optional investigator for the draft. */
  ownerId: optionalId,
  note: z.string().trim().max(5000).default(""),
});
export type LawRaiseIncidentInput = z.infer<typeof lawRaiseIncidentSchema>;

export const lawRaiseActionSchema = z.object({
  description: z.string().trim().max(2000, "Use at most 2000 characters").default(""),
  ownerId: optionalId,
  departmentId: optionalId,
  dueDate: optionalDate,
  /** Client key per dialog – a repeated submit returns the action already raised. */
  requestKey: z.string().trim().min(8).max(64),
});
export type LawRaiseActionInput = z.infer<typeof lawRaiseActionSchema>;

export const lawRequirementListQuerySchema = paginationQuerySchema.extend({
  profileId: optionalId,
  view: z.enum(REQUIREMENT_VIEWS).default("applies"),
  status: z.enum(EVALUATION_STATUSES).optional(),
  register: z.string().trim().max(40).optional(),
  category: z.string().trim().max(80).optional(),
  /** Only requirements I am responsible for. */
  mine: z.enum(["true", "false"]).optional(),
  /** Needs attention: review required or review date passed. */
  attention: z.enum(["true", "false"]).optional(),
});
export type LawRequirementListQuery = z.infer<typeof lawRequirementListQuerySchema>;

// ── Tasks ───────────────────────────────────────────────────────────────────

const taskFields = {
  title: z.string().trim().max(200, "Use at most 200 characters").default(""),
  details: z.string().trim().max(5000, "Use at most 5000 characters").default(""),
  ownerId: optionalId,
  departmentId: optionalId,
  dueDate: optionalDate,
  priority: z.enum(LAW_TASK_PRIORITIES).default("MEDIUM"),
};

export const lawTaskCreateSchema = z.object({ ...taskFields, requirementId: idSchema });
export type LawTaskCreateInput = z.infer<typeof lawTaskCreateSchema>;

export const lawTaskUpdateSchema = z.object({ ...taskFields, expectedVersion });
export type LawTaskUpdateInput = z.infer<typeof lawTaskUpdateSchema>;

export const lawTaskCompleteSchema = z.object({ notes: z.string().trim().max(5000, "Use at most 5000 characters").default(""), expectedVersion });
export type LawTaskCompleteInput = z.infer<typeof lawTaskCompleteSchema>;

export const LAW_TASK_VIEWS = ["mine", "all"] as const;
export const lawTaskListQuerySchema = paginationQuerySchema.extend({
  view: z.enum(LAW_TASK_VIEWS).default("mine"),
  status: z.enum(["OPEN", "COMPLETED", "ARCHIVED", "ALL"]).default("OPEN"),
  profileId: optionalId,
  requirementId: optionalId,
  register: z.string().trim().max(40).optional(),
  due: z.enum(["overdue", "week"]).optional(),
});
export type LawTaskListQuery = z.infer<typeof lawTaskListQuerySchema>;

// ── Library, content packages, reports ──────────────────────────────────────

export const lawLegislationQuerySchema = paginationQuerySchema.extend({
  profileId: optionalId,
  /** Exact phrase instead of all words. */
  exact: z.enum(["true", "false"]).optional(),
  register: z.string().trim().max(40).optional(),
  category: z.string().trim().max(80).optional(),
  level: z.string().trim().max(20).optional(),
});
export type LawLegislationQuery = z.infer<typeof lawLegislationQuerySchema>;

export const lawProfileQuerySchema = z.object({ profileId: optionalId });

export const lawPackageSchema = z.object({ package: z.unknown() });

export const LAW_REPORT_KEYS = ["register", "tasks", "links"] as const;
export type LawReportKey = (typeof LAW_REPORT_KEYS)[number];
export const lawReportQuerySchema = z.object({
  profileId: optionalId,
  register: z.string().trim().max(40).optional(),
  category: z.string().trim().max(80).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
export type LawReportQuery = z.infer<typeof lawReportQuerySchema>;

export const lawConnectionsQuerySchema = z.object({ entityType: z.enum(LAW_LINK_TARGETS), entityId: idSchema });

