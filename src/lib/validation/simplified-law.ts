import { z } from "zod";
import { ANSWERS, CHECK_FILTERS, COMPLIANCE, LEGAL_STATUSES, SLAW_LIMITS as L } from "../simplified-law";
import { optionalId, paginationQuerySchema } from "./common";

/** Zod schemas shared by the Simplified law screens and the API. Business gates live in src/lib/simplified-law/rules.ts. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || DATE.test(v), "Use a valid date");
const expectedVersion = z.number().int().min(1);
const text = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`).default("");
const required = (max: number, what: string) => z.string().trim().min(1, `Type ${what}`).max(max, `Use at most ${max} characters`);
const url = z
  .string()
  .trim()
  .max(L.url)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "Use a web address starting with https://");

// ── Register (read) ─────────────────────────────────────────────────────────

export const legislationListQuerySchema = paginationQuerySchema.extend({
  /** A category or sub-category id; empty = all legislation. */
  categoryId: z.string().trim().max(64).optional(),
  jurisdiction: z.string().trim().max(L.name).optional(),
  status: z.enum(LEGAL_STATUSES).optional(),
  hideRepealed: z.enum(["true", "false"]).default("true"),
  check: z.enum(CHECK_FILTERS).optional(),
  /** Configuration list: also show archived laws. */
  archived: z.enum(["true", "false"]).default("false"),
});
export type LegislationListQuery = z.infer<typeof legislationListQuerySchema>;

export const historyQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });

// ── Step 4: applicability ───────────────────────────────────────────────────

export const applicabilitySchema = z.object({
  expectedVersion,
  answers: z
    .array(z.object({ questionId: z.string().min(1).max(64), answer: z.enum(ANSWERS).nullable(), reason: text(L.reason) }))
    .max(50)
    .default([]),
  /** null = only save the answers for later. */
  decision: z.enum(["APPLIES", "DOES_NOT_APPLY"]).nullable(),
  reason: text(L.reason),
});
export type ApplicabilityInput = z.infer<typeof applicabilitySchema>;

// ── Step 5: requirements and actions ────────────────────────────────────────

export const requirementAssessSchema = z.object({
  expectedVersion,
  compliance: z.enum(COMPLIANCE),
  reason: text(L.reason),
  actionText: text(L.text),
  actionOwnerId: optionalId,
  actionDueDate: optionalDate,
});
export type RequirementAssessInput = z.infer<typeof requirementAssessSchema>;

export const actionCompleteSchema = z.object({ expectedVersion, note: text(L.reason) });
export type SlawActionCompleteInput = z.infer<typeof actionCompleteSchema>;

export const actionListQuerySchema = paginationQuerySchema.extend({
  view: z.enum(["mine", "all"]).default("mine"),
  status: z.enum(["OPEN", "DONE", "ALL"]).default("OPEN"),
  overdue: z.enum(["true"]).optional(),
});
export type SlawActionListQuery = z.infer<typeof actionListQuerySchema>;

// ── Configuration ───────────────────────────────────────────────────────────

export const categoryCreateSchema = z.object({
  name: required(L.name, "a name"),
  description: text(500),
  /** The category a new sub-category belongs to; empty = a new top-level category. */
  parentId: optionalId,
});
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z.object({ name: required(L.name, "a name"), description: text(500) });
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

export const moveSchema = z.object({ direction: z.enum(["up", "down"]) });
export type MoveInput = z.infer<typeof moveSchema>;

export const archiveSchema = z.object({ archived: z.boolean() });

export const legislationSchema = z.object({
  categoryId: z.string().trim().min(1, "Choose a sub-category").max(64),
  title: required(L.title, "the title"),
  shortTitle: text(L.short),
  reference: text(L.short),
  jurisdiction: z.string().trim().min(1, "Choose a jurisdiction").max(L.name),
  status: z.enum(LEGAL_STATUSES).default("ACTIVE"),
  kindLabel: text(L.short),
  relationNote: text(500),
  summary: text(L.summary),
  officialUrl: url,
  guidanceUrl: url,
});
export type LegislationInput = z.infer<typeof legislationSchema>;

export const legislationUpdateSchema = legislationSchema.extend({ expectedVersion });
export type LegislationUpdateInput = z.infer<typeof legislationUpdateSchema>;

export const articleSchema = z.object({
  chapter: text(200),
  number: required(40, "the article or section number"),
  title: required(L.title, "a short title"),
  appliesFrom: optionalDate,
  appliesTo: z.array(z.string().trim().min(1).max(60)).max(L.roles).default([]),
});
export type ArticleInput = z.infer<typeof articleSchema>;

export const questionSchema = z.object({ text: required(500, "the question") });
export type QuestionInput = z.infer<typeof questionSchema>;

export const requirementSchema = z.object({ section: text(200), text: required(L.text, "the requirement"), articles: text(200) });
export type RequirementInput = z.infer<typeof requirementSchema>;

export const settingsSchema = z.object({
  expectedVersion: z.number().int().min(0),
  registerTitle: required(L.title, "a title"),
  statusLabels: z.object(Object.fromEntries(LEGAL_STATUSES.map((s) => [s, required(40, "a label")])) as Record<(typeof LEGAL_STATUSES)[number], z.ZodString>),
  hideRepealed: z.boolean(),
  defaultActionDays: z.number().int().min(1, "Use at least 1 day").max(365, "Use at most 365 days"),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const jurisdictionSchema = z.object({ name: required(L.name, "a name") });
export const jurisdictionRenameSchema = z.object({ from: z.string().trim().min(1).max(L.name), to: required(L.name, "a name") });
export const jurisdictionMoveSchema = z.object({ name: z.string().trim().min(1).max(L.name), direction: z.enum(["up", "down"]) });
