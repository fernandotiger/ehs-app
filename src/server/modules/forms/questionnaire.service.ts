import "server-only";
import { fieldsForSite, validateQuestionnaireAnswers, type AnswerValidation, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import type { FormValidationMode } from "@/lib/forms/schema-builder";
import { formService } from "./form.service";

/**
 * Module-facing questionnaire contract.
 *
 *   const snapshot = await captureQuestionnaire(versionId, { siteId });   // when the record is created
 *   const check = validateAnswers(snapshot, answers, { mode: "submit" });  // on every save
 *   if (!check.valid) throw new ValidationError("…", check.errors);
 *
 * Store `snapshot` (JSON) and `check.data` with the record. A later publication never changes
 * either. `file` answers carry upload ids – consume them as evidence (see `pendingUploads`).
 */

/** Captures a published version for one record: questions filtered for the site, settings copied. */
export async function captureQuestionnaire(versionId: string, options: { siteId?: string | null } = {}): Promise<QuestionnaireSnapshot> {
  const version = await formService.getVersion(versionId);
  const siteId = options.siteId ?? null;
  return {
    formId: version.formId,
    versionId: version.id,
    version: version.version,
    name: version.name,
    module: version.module,
    purpose: version.purpose,
    siteId,
    fields: fieldsForSite(version.fields, siteId),
    settings: version.settings,
    capturedAt: new Date().toISOString(),
  };
}

/** Field errors for answers (required only on submit; headings/scores and other sites' questions never required). */
export function validateAnswers(snapshot: QuestionnaireSnapshot, answers: FormValues | null | undefined, options: { mode: FormValidationMode }): AnswerValidation {
  return validateQuestionnaireAnswers(snapshot, answers, options);
}
