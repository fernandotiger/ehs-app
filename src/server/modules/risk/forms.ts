import "server-only";
import { fieldsForSite, validateQuestionnaireAnswers, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import { parseStoredFormSchema } from "@/lib/forms/definition-schema";
import { defaultRiskSettings, readRiskSettings, type RiskFormSettings } from "@/lib/forms/settings";
import { isRiskMethod } from "@/lib/risk/scoring";
import type { DbClient } from "@/server/db/client";
import { ValidationError } from "@/server/http/errors";

/**
 * Risk questionnaires: a published Risk form version is captured per assessment (questions
 * filtered for the department's site + its settings = the scoring/review rules). Republishing
 * never changes a captured assessment.
 */

/** Mandatory Risk questions (src/lib/forms/catalog.ts) – filled from the workflow's own controls. */
export const RISK_SYSTEM_KEYS = ["riskTitle", "hazard", "site", "likelihood", "severity", "riskScore", "owner", "reviewDate"] as const;
const SYSTEM = new Set<string>(RISK_SYSTEM_KEYS);

export async function captureRiskForm(db: DbClient, versionId: string, siteId: string | null): Promise<QuestionnaireSnapshot> {
  const version = await db.formVersion.findUnique({ where: { id: versionId } });
  if (!version || version.module !== "risk") throw new ValidationError("Choose a published Risk form.");
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

/** Captured rules of a snapshot (defaults for its method when the stored settings are unreadable). */
export function rulesOf(snapshot: Pick<QuestionnaireSnapshot, "settings" | "purpose">): RiskFormSettings {
  const read = readRiskSettings(snapshot.settings);
  if (read) return read;
  return defaultRiskSettings(isRiskMethod(snapshot.purpose) ? snapshot.purpose : "5x5");
}

export function readRules(value: unknown, method: string): RiskFormSettings {
  return readRiskSettings(value) ?? defaultRiskSettings(isRiskMethod(method) ? method : "5x5");
}

/** Custom (non-system) questions of a snapshot – the ones the wizard asks. */
export function customFields(snapshot: Pick<QuestionnaireSnapshot, "fields">) {
  return snapshot.fields.filter((f) => !SYSTEM.has(f.key));
}

export interface SystemValues {
  title: string;
  hazards: string[];
  site: string;
  ownerId: string | null;
  reviewDate: string | null;
  /** Values of the highest-scoring matrix hazard (null for FMEA / Checklist). */
  likelihood: number | null;
  severity: number | null;
}

/** Stores the mandatory questions' answers from the workflow controls (never typed twice). */
export function composeAnswers(snapshot: QuestionnaireSnapshot, custom: FormValues, values: SystemValues): FormValues {
  const keys = new Set(snapshot.fields.map((f) => f.key));
  const out: FormValues = {};
  for (const [k, v] of Object.entries(custom)) if (!SYSTEM.has(k)) out[k] = v;
  const set = (key: string, value: string | null) => {
    if (keys.has(key) && value) out[key] = value;
  };
  set("riskTitle", values.title.trim() || null);
  set("hazard", values.hazards.filter(Boolean).join("; ") || null);
  set("site", values.site || null);
  set("owner", values.ownerId);
  set("reviewDate", values.reviewDate);
  set("likelihood", values.likelihood ? String(values.likelihood) : null);
  set("severity", values.severity ? String(values.severity) : null);
  return out;
}

export interface AnswerCheck {
  data: FormValues;
  /** Labels of required custom questions without an answer. */
  missing: string[];
  problems: string[];
}

/** Draft validation always (malformed → 422); required custom questions are returned for the submit gate. */
export function checkRiskAnswers(snapshot: QuestionnaireSnapshot, answers: FormValues): AnswerCheck {
  const effective = { ...snapshot, fields: snapshot.fields.map((f) => (SYSTEM.has(f.key) ? { ...f, required: false } : f)) };
  const draft = validateQuestionnaireAnswers(effective, answers, { mode: "draft" });
  if (!draft.valid) {
    const details = Object.entries(draft.errors).map(([path, message]) => ({ path: `answers.${path}`, message }));
    throw new ValidationError(details[0]?.message ?? "Some answers are not valid", details);
  }
  const submit = validateQuestionnaireAnswers(effective, answers, { mode: "submit" });
  const missing: string[] = [];
  const problems: string[] = [];
  for (const [key, message] of Object.entries(submit.errors)) {
    const field = snapshot.fields.find((f) => f.key === key);
    if (field && /is required$/.test(message)) missing.push(field.label);
    else problems.push(message);
  }
  return { data: draft.data, missing, problems };
}
