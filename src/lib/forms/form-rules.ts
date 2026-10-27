/**
 * Form Builder rules shared by the designer (live feedback) and the server (save / publish).
 *
 * - Saving a draft only needs a structurally valid design (keys, options …) so work in progress
 *   is never lost; publishing additionally runs the module rules (Incident duplicates, Risk
 *   thresholds) and requires every custom question to be named.
 * - The server re-validates on publish; the designer is never trusted.
 */
import { enforceSystemQuestions, formModule, isFormPurpose, PALETTE_TYPES } from "./catalog";
import { formSchemaDefinitionSchema } from "./definition-schema";
import { incidentConflicts, incidentFieldConflict, normaliseLabel, type IncidentPurpose } from "./incident-rules";
import { validateFormSettings } from "./settings";
import type { FormFieldDefinition } from "./types";

export interface FormDesign {
  module: string;
  purpose: string;
  fields: FormFieldDefinition[];
  settings: Record<string, unknown>;
}

export interface DesignIssue {
  /** "fields.<index>.<prop>", "settings.thresholds" or "" for the whole form. */
  path: string;
  /** Question key when the issue is about one question. */
  fieldKey?: string;
  message: string;
}

/** Structural problems (always enforced, also for drafts). */
export function structuralIssues(fields: readonly FormFieldDefinition[]): DesignIssue[] {
  const parsed = formSchemaDefinitionSchema.safeParse(fields);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => {
    const index = typeof i.path[0] === "number" ? i.path[0] : undefined;
    return { path: ["fields", ...i.path].join("."), fieldKey: index !== undefined ? fields[index]?.key : undefined, message: i.message };
  });
}

/**
 * Full validation. `forPublish` adds the publication rules. System questions are compared with
 * their canonical definition (missing ones are reported – they cannot be deleted).
 */
export function validateFormDesign(design: FormDesign, options: { forPublish: boolean }): DesignIssue[] {
  const issues: DesignIssue[] = [];
  if (!formModule(design.module) || !isFormPurpose(design.module, design.purpose)) {
    return [{ path: "", message: "Unknown module or purpose." }];
  }
  issues.push(...structuralIssues(design.fields));

  const { missing } = enforceSystemQuestions(design.module, design.purpose, design.settings, design.fields);
  for (const q of missing) issues.push({ path: "fields", message: `The required question "${q.label}" cannot be removed.` });

  design.fields.forEach((field, index) => {
    if (!field.system && !PALETTE_TYPES.includes(field.type)) {
      issues.push({ path: `fields.${index}.type`, fieldKey: field.key, message: `"${field.label}" uses a component that is not available.` });
    }
  });

  issues.push(...validateFormSettings(design.module, design.purpose, design.settings));

  if (options.forPublish) {
    if (!design.fields.some((f) => f.type !== "heading")) issues.push({ path: "fields", message: "Add at least one question." });
    design.fields.forEach((field, index) => {
      const label = field.label.trim();
      if (!label || (!field.system && field.type !== "heading" && normaliseLabel(label) === "untitled question")) {
        issues.push({ path: `fields.${index}.label`, fieldKey: field.key, message: `Name question ${index + 1} before publishing.` });
      }
      field.options?.forEach((o, oi) => {
        if (!o.label.trim()) issues.push({ path: `fields.${index}.options.${oi}`, fieldKey: field.key, message: `"${label}" has an empty option.` });
      });
    });
    if (design.module === "incidents") {
      for (const conflict of incidentConflicts(design.fields, design.purpose as IncidentPurpose)) {
        const index = design.fields.findIndex((f) => f.key === conflict.key);
        issues.push({ path: `fields.${index}.label`, fieldKey: conflict.key, message: conflict.message });
      }
    }
  }
  return issues;
}

/**
 * Whether a question copied from another form can be added (Incident duplicate rule).
 * Returns the blocking message or null.
 */
export function reuseConflict(design: Pick<FormDesign, "module" | "purpose" | "fields">, question: Pick<FormFieldDefinition, "label" | "type">): string | null {
  if (design.module !== "incidents") return null;
  return incidentFieldConflict(question, design.purpose as IncidentPurpose, design.fields);
}

// ── Reusing created questions ───────────────────────────────────────────────

export interface ReuseSourceForm {
  id: string;
  name: string;
  module: string;
  fields: readonly FormFieldDefinition[];
}

export interface ReusableQuestion {
  /** The question definition to copy (key is replaced when it is added). */
  field: FormFieldDefinition;
  formId: string;
  formName: string;
  module: string;
}

/** Identity of a question definition – identical copies across forms are shown once. */
function signature(field: FormFieldDefinition): string {
  return JSON.stringify([
    normaliseLabel(field.label),
    field.type,
    Boolean(field.required),
    field.helpText ?? "",
    field.placeholder ?? "",
    (field.options ?? []).map((o) => o.label.trim()),
  ]);
}

/**
 * Existing named custom questions whose label contains `query` (case-insensitive), de-duplicated
 * and limited to `limit` (10). System questions and section headings are not offered.
 * `forms` should be ordered most recent first.
 */
export function reusableQuestionChoices(forms: readonly ReuseSourceForm[], query: string, options: { excludeFormId?: string; limit?: number } = {}): ReusableQuestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const limit = options.limit ?? 10;
  const seen = new Set<string>();
  const out: ReusableQuestion[] = [];
  for (const form of forms) {
    if (form.id === options.excludeFormId) continue;
    for (const field of form.fields) {
      if (field.system || field.type === "heading" || field.type === "score") continue;
      const label = field.label.trim();
      if (!label || normaliseLabel(label) === "untitled question" || !label.toLowerCase().includes(q)) continue;
      const sig = signature(field);
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ field, formId: form.id, formName: form.name, module: form.module });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** An independent copy of a reused question with a fresh key (options and settings copied). */
export function copyQuestion(field: FormFieldDefinition, key: string): FormFieldDefinition {
  const copy: FormFieldDefinition = JSON.parse(JSON.stringify(field));
  delete copy.system;
  delete copy.showWhen;
  return { ...copy, key };
}
