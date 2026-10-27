import "server-only";
import { fieldsForSite, repeatedDefaultKeys, validateQuestionnaireAnswers as validateQuestionnaire, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import { parseStoredFormSchema } from "@/lib/forms/definition-schema";
import type { DbClient } from "@/server/db/client";
import { ValidationError } from "@/server/http/errors";

/**
 * Report / Investigation questionnaires for incidents. Same contract as
 * `captureQuestionnaire` (forms module) but transaction-aware, so cross-module follow-up routing
 * can capture inside the caller's transaction.
 */

export type IncidentFormPurpose = "REPORT" | "INVESTIGATION";

/** Mandatory question keys (src/lib/forms/catalog.ts) mapped to the workflow's own controls. */
export const REPORT_SYSTEM_KEYS = { title: "incidentTitle", occurredAt: "occurredAt", site: "site", narrative: "whatHappened" } as const;
export const INVESTIGATION_SYSTEM_KEYS = { findings: "investigationFindings", rootCause: "rootCauseAnalysis" } as const;
const REPORT_KEYS: string[] = Object.values(REPORT_SYSTEM_KEYS);

const PURPOSE_LABEL: Record<IncidentFormPurpose, string> = { REPORT: "Report", INVESTIGATION: "Investigation" };

/** Latest published version of a bound form (null when the form was never published). */
export async function publishedVersionId(db: DbClient, formId: string | null | undefined): Promise<string | null> {
  if (!formId) return null;
  const form = await db.formDefinition.findUnique({ where: { id: formId }, select: { currentVersionId: true } });
  return form?.currentVersionId ?? null;
}

/** Captures a published Incident form version for one record (questions filtered for the site). */
export async function captureIncidentForm(db: DbClient, versionId: string, purpose: IncidentFormPurpose, siteId: string | null): Promise<QuestionnaireSnapshot> {
  const version = await db.formVersion.findUnique({ where: { id: versionId } });
  if (!version || version.module !== "incidents" || version.purpose !== purpose) {
    throw new ValidationError(`Choose a published Incident ${PURPOSE_LABEL[purpose].toLowerCase()} form.`);
  }
  const settings = version.settings && typeof version.settings === "object" && !Array.isArray(version.settings) ? (version.settings as Record<string, unknown>) : {};
  return {
    formId: version.formId,
    versionId: version.id,
    version: version.version,
    name: version.name,
    module: version.module,
    purpose: version.purpose,
    siteId,
    fields: fieldsForSite(parseStoredFormSchema(version.fields), siteId),
    settings,
    capturedAt: new Date().toISOString(),
  };
}

export function asSnapshot(value: unknown): QuestionnaireSnapshot | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as QuestionnaireSnapshot).fields)) return null;
  return value as QuestionnaireSnapshot;
}

export function asAnswers(value: unknown): FormValues {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as FormValues) : {};
}

/**
 * Questions the workflow shows through its own controls: the Report mandatory questions (title,
 * date, site, narrative) and – in older snapshots – repeated default fields (Form Builder duplicate rule).
 */
export function hiddenAnswerKeys(snapshot: QuestionnaireSnapshot | null, purpose: IncidentFormPurpose): string[] {
  if (!snapshot) return [];
  const repeated = repeatedDefaultKeys(snapshot.fields, purpose);
  return purpose === "REPORT" ? [...new Set([...REPORT_KEYS, ...repeated])] : repeated;
}

export interface AnswerCheck {
  /** Cleaned answers (draft-valid). */
  data: FormValues;
  /** Labels of required questions not answered (submit mode). */
  missing: string[];
  /** Other submit-mode problems (malformed answers). */
  problems: string[];
}

/**
 * Draft-mode validation always (malformed answers → 422); submit-mode problems are returned so
 * the workflow can list them as blockers. Repeated default questions are never required (the
 * canonical control supplies the value).
 */
export function checkAnswers(snapshot: QuestionnaireSnapshot, answers: FormValues, purpose: IncidentFormPurpose): AnswerCheck {
  const repeated = new Set(repeatedDefaultKeys(snapshot.fields, purpose));
  const effective = { ...snapshot, fields: snapshot.fields.map((f) => (repeated.has(f.key) ? { ...f, required: false } : f)) };
  const draft = validateQuestionnaire(effective, answers, { mode: "draft" });
  if (!draft.valid) {
    const details = Object.entries(draft.errors).map(([path, message]) => ({ path: `answers.${path}`, message }));
    throw new ValidationError(details[0]?.message ?? "Some answers are not valid", details);
  }
  const submit = validateQuestionnaire(effective, answers, { mode: "submit" });
  const missing: string[] = [];
  const problems: string[] = [];
  for (const [key, message] of Object.entries(submit.errors)) {
    const field = snapshot.fields.find((f) => f.key === key);
    if (field && /is required$/.test(message)) missing.push(field.label);
    else problems.push(message);
  }
  return { data: draft.data, missing, problems };
}
