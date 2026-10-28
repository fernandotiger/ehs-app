import { z } from "zod";
import { idSchema, paginationQuerySchema } from "./common";

/**
 * Document surveys – zod schemas shared by the survey builder, the reader form and the API.
 * Form-facing schemas avoid transforms (input = output); the service normalises (trims, drops
 * options of text questions).
 */

export const SURVEY_QUESTION_TYPES = ["TEXT", "SINGLE", "MULTIPLE"] as const;
export type SurveyQuestionTypeValue = (typeof SURVEY_QUESTION_TYPES)[number];

export const SURVEY_STATUSES = ["ACTIVE", "CLOSED", "REPLACED"] as const;
export type SurveyStatusValue = (typeof SURVEY_STATUSES)[number];

export const SURVEY_LIMITS = {
  minQuestions: 1,
  maxQuestions: 20,
  minOptions: 2,
  maxOptions: 20,
  titleMax: 200,
  introMax: 2000,
  labelMax: 300,
  helpMax: 300,
  optionMax: 120,
  textAnswerMax: 2000,
} as const;

export const surveyQuestionSchema = z.object({
  type: z.enum(SURVEY_QUESTION_TYPES),
  label: z.string().trim().min(1, "Write the question").max(SURVEY_LIMITS.labelMax, `Keep the question under ${SURVEY_LIMITS.labelMax} characters`),
  help: z.string().trim().max(SURVEY_LIMITS.helpMax, `Keep the help line under ${SURVEY_LIMITS.helpMax} characters`),
  required: z.boolean(),
  /** Choice labels (ignored for text questions). */
  options: z
    .array(z.string().max(SURVEY_LIMITS.optionMax, `Keep each option under ${SURVEY_LIMITS.optionMax} characters`))
    .max(SURVEY_LIMITS.maxOptions, `Use at most ${SURVEY_LIMITS.maxOptions} options`),
});
export type SurveyQuestionInput = z.infer<typeof surveyQuestionSchema>;

export interface SurveyDefinitionIssue {
  /** Dotted path, e.g. "questions.0.options.1". */
  path: string;
  message: string;
}

/**
 * Structural rules zod cannot express per field: choice questions need 2–20 options that are
 * filled in and different from each other. Pure – used by the zod schema, the builder's inline
 * validation and the unit tests.
 */
export function surveyDefinitionIssues(def: { questions: Pick<SurveyQuestionInput, "type" | "options">[] }): SurveyDefinitionIssue[] {
  const issues: SurveyDefinitionIssue[] = [];
  def.questions.forEach((q, qi) => {
    if (q.type === "TEXT") return;
    const options = q.options.map((o) => o.trim());
    const seen = new Map<string, number>();
    options.forEach((option, oi) => {
      if (!option) {
        issues.push({ path: `questions.${qi}.options.${oi}`, message: "Fill in this option or remove it" });
        return;
      }
      const key = option.toLocaleLowerCase();
      if (seen.has(key)) issues.push({ path: `questions.${qi}.options.${oi}`, message: "This option is already in the list" });
      else seen.set(key, oi);
    });
    if (options.length < SURVEY_LIMITS.minOptions) issues.push({ path: `questions.${qi}.options`, message: "Add at least 2 options" });
  });
  return issues;
}

const surveyDefinitionBaseSchema = z.object({
  title: z.string().trim().min(3, "Give the induction a title (at least 3 characters)").max(SURVEY_LIMITS.titleMax),
  intro: z.string().trim().max(SURVEY_LIMITS.introMax, `Keep the introduction under ${SURVEY_LIMITS.introMax} characters`),
  /** "Everyone must complete it". */
  isMandatory: z.boolean(),
  /** "Complete within N days" (only used when mandatory). */
  dueDays: z.number({ error: "Enter a number of days" }).int("Enter whole days").min(1, "At least 1 day").max(365, "At most 365 days"),
  /** "Let people answer anonymously". */
  allowAnonymous: z.boolean(),
  questions: z
    .array(surveyQuestionSchema)
    .min(SURVEY_LIMITS.minQuestions, "Add at least one question")
    .max(SURVEY_LIMITS.maxQuestions, `An induction can have at most ${SURVEY_LIMITS.maxQuestions} questions`),
});

export const surveyDefinitionSchema = surveyDefinitionBaseSchema.superRefine((def, ctx) => {
  for (const issue of surveyDefinitionIssues(def)) {
    ctx.addIssue({ code: "custom", path: issue.path.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p)), message: issue.message });
  }
});
export type SurveyDefinitionInput = z.infer<typeof surveyDefinitionSchema>;

/** PUT /api/documents/:id/survey – create (no expectedVersion) or edit (with expectedVersion). */
export const surveyUpsertSchema = z.object({
  survey: surveyDefinitionSchema,
  expectedVersion: z.number().int().min(1).optional(),
});
export type SurveyUpsertInput = z.infer<typeof surveyUpsertSchema>;

/** close / reopen. */
export const surveyCommandSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
});
export type SurveyCommandInput = z.infer<typeof surveyCommandSchema>;

export const surveyAnswerItemSchema = z.object({
  questionId: idSchema,
  text: z.string().max(SURVEY_LIMITS.textAnswerMax, `Keep your answer under ${SURVEY_LIMITS.textAnswerMax} characters`).optional(),
  choices: z.array(z.string().max(SURVEY_LIMITS.optionMax)).max(SURVEY_LIMITS.maxOptions).optional(),
});
export type SurveyAnswerItemInput = z.infer<typeof surveyAnswerItemSchema>;

/** POST /api/documents/:id/survey/answer. */
export const surveyAnswerSchema = z.object({
  surveyId: idSchema,
  /** The document version the reader opened (must be the current one when online); null when the survey has no file. */
  versionId: idSchema.nullish(),
  anonymous: z.boolean(),
  answers: z.array(surveyAnswerItemSchema).max(SURVEY_LIMITS.maxQuestions),
});
export type SurveyAnswerInput = z.infer<typeof surveyAnswerSchema>;

/** Payload of the `document.survey_answer` offline outbox operation. */
export const offlineSurveyAnswerPayloadSchema = surveyAnswerSchema.extend({
  documentId: idSchema,
  clientAnsweredAt: z.string().datetime(),
});
export type OfflineSurveyAnswerPayload = z.infer<typeof offlineSurveyAnswerPayloadSchema>;

/** Which survey of the document (default: the current one; previous surveys by id). */
export const surveySelectQuerySchema = z.object({
  surveyId: idSchema.optional(),
});
export type SurveySelectQuery = z.infer<typeof surveySelectQuerySchema>;

export const surveyTextAnswersQuerySchema = paginationQuerySchema.extend({
  surveyId: idSchema.optional(),
  questionId: idSchema,
});
export type SurveyTextAnswersQuery = z.infer<typeof surveyTextAnswersQuerySchema>;

export const SURVEY_PARTICIPATION_STATUSES = ["answered", "not_answered"] as const;
export type SurveyParticipationStatus = (typeof SURVEY_PARTICIPATION_STATUSES)[number];

export const surveyParticipationQuerySchema = paginationQuerySchema.extend({
  surveyId: idSchema.optional(),
  status: z.enum(SURVEY_PARTICIPATION_STATUSES).default("not_answered"),
  departmentId: idSchema.optional(),
});
export type SurveyParticipationQuery = z.infer<typeof surveyParticipationQuerySchema>;
