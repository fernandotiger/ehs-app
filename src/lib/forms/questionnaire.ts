/**
 * Questionnaire snapshots – what a record keeps when it uses a published form version.
 *
 * A module captures a snapshot (server: `captureQuestionnaire(versionId, { siteId })`) when the
 * record is created and stores it with the answers. Republishing the form never changes it.
 * Questions restricted to other sites are left out of the snapshot, so they are neither shown
 * nor required there. Framework-free (client + server).
 */
import { validateFormData, type FormIssue, type FormValidationMode } from "./schema-builder";
import { isAnswerable, type FormFieldDefinition, type FormValues } from "./types";

export interface QuestionnaireSnapshot {
  formId: string;
  versionId: string;
  version: number;
  name: string;
  module: string;
  purpose: string;
  /** Site the questions were filtered for (null = only questions available at every site). */
  siteId: string | null;
  fields: FormFieldDefinition[];
  settings: Record<string, unknown>;
  capturedAt: string;
}

/** Questions that apply at `siteId` (no selected sites = every site). */
export function fieldsForSite(fields: readonly FormFieldDefinition[], siteId: string | null | undefined): FormFieldDefinition[] {
  return fields.filter((f) => !f.siteIds?.length || (siteId ? f.siteIds.includes(siteId) : false));
}

export interface AnswerValidation {
  valid: boolean;
  /** Field key → first message. */
  errors: Record<string, string>;
  /** Cleaned answers (unknown, hidden and empty answers removed). */
  data: FormValues;
}

/**
 * Validates answers against a snapshot. `submit` enforces required questions; `draft` only
 * checks that given answers are well-formed. Section headings and calculated scores are never
 * required, and questions hidden for the snapshot's site are not part of it.
 */
export function validateQuestionnaireAnswers(
  snapshot: Pick<QuestionnaireSnapshot, "fields" | "siteId">,
  answers: FormValues | null | undefined,
  options: { mode: FormValidationMode },
): AnswerValidation {
  const fields = fieldsForSite(snapshot.fields, snapshot.siteId).filter((f) => isAnswerable(f.type));
  const result = validateFormData(fields, answers ?? {}, options.mode);
  if (result.success) return { valid: true, errors: {}, data: result.data };
  return { valid: false, errors: issuesByField(result.issues), data: {} };
}

function issuesByField(issues: FormIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.split(".")[0] ?? "";
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

/** Upload ids in `file` answers – the module consumes them as evidence when it saves the record. */
export function pendingUploads(snapshot: Pick<QuestionnaireSnapshot, "fields">, answers: FormValues): { fieldKey: string; uploadId: string; fileName: string }[] {
  const out: { fieldKey: string; uploadId: string; fileName: string }[] = [];
  for (const field of snapshot.fields) {
    if (field.type !== "file") continue;
    const value = answers[field.key];
    if (!Array.isArray(value)) continue;
    for (const file of value as { uploadId?: string; fileName?: string }[]) {
      if (file?.uploadId) out.push({ fieldKey: field.key, uploadId: file.uploadId, fileName: file.fileName ?? "file" });
    }
  }
  return out;
}
