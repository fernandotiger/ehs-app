import { z } from "zod";

/**
 * Document survey settings (Configuration → System settings → Document surveys).
 * - anonymityThreshold: anonymous answers stay out of every result, chart and export until at
 *   least this many anonymous answers exist (k-anonymity – stops identification by elimination).
 * - defaultDueDays: the "Answer within" default for mandatory surveys.
 */
export const documentSurveySettingsSchema = z.object({
  anonymityThreshold: z.coerce.number({ error: "Enter a number from 1 to 10" }).int("Enter a whole number").min(1, "Use a number from 1 to 10").max(10, "Use a number from 1 to 10"),
  defaultDueDays: z.coerce.number({ error: "Enter a number of days" }).int("Enter whole days").min(1, "At least 1 day").max(365, "At most 365 days"),
});

export type DocumentSurveySettings = z.infer<typeof documentSurveySettingsSchema>;

export const DEFAULT_DOCUMENT_SURVEY_SETTINGS: DocumentSurveySettings = {
  anonymityThreshold: 3,
  defaultDueDays: 14,
};
