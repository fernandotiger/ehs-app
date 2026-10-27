import { z } from "zod";
import { isAnswerable, type FormFieldDefinition, type FormValues } from "./types";
import { isEmptyValue, pruneFormValues, visibleFields } from "./visibility";

/**
 * - `submit`: required fields must be answered, all constraints apply.
 * - `draft`: every field is optional, but answers that are present must be well-formed.
 */
export type FormValidationMode = "submit" | "draft";

export interface FormIssue {
  /** Field key. */
  path: string;
  message: string;
}

export type FormValidationResult = { success: true; data: FormValues } | { success: false; issues: FormIssue[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/** HTML inputs produce strings / empty values – normalise before validating. */
function normalise(field: FormFieldDefinition, value: unknown): unknown {
  if (isEmptyValue(value)) return undefined;
  switch (field.type) {
    case "number":
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
      return value;
    case "checkbox":
    case "boolean":
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    case "multiselect":
      return typeof value === "string" ? [value] : value;
    case "file":
      return Array.isArray(value) ? value : [value];
    default:
      return typeof value === "string" ? value.trim() : value;
  }
}

function typeError(label: string, expected: string) {
  return (issue: { input?: unknown }) => (issue.input === undefined ? `${label} is required` : `${label} must be ${expected}`);
}

function optionValues(field: FormFieldDefinition): string[] | null {
  return field.options?.length ? field.options.map((o) => o.value) : null;
}

/** Zod schema for a single answer (before required/optional wrapping). */
function baseSchema(field: FormFieldDefinition, mode: FormValidationMode): z.ZodType {
  const { label } = field;
  switch (field.type) {
    case "text":
    case "textarea": {
      let s = z.string({ error: typeError(label, "text") });
      if (field.min !== undefined) s = s.min(field.min, `${label} must be at least ${field.min} characters`);
      s = s.max(field.max ?? (field.type === "text" ? 500 : 5000), `${label} is too long`);
      return s;
    }
    case "number": {
      let s = z.number({ error: typeError(label, "a number") });
      if (field.min !== undefined) s = s.min(field.min, `${label} must be at least ${field.min}`);
      if (field.max !== undefined) s = s.max(field.max, `${label} must be at most ${field.max}`);
      return s;
    }
    case "select":
    case "radio": {
      const allowed = optionValues(field);
      const s = z.string({ error: typeError(label, "a valid choice") });
      return allowed ? s.refine((v) => allowed.includes(v), `${label}: choose one of the listed options`) : s;
    }
    case "multiselect": {
      const allowed = optionValues(field);
      const item = allowed ? z.string().refine((v) => allowed.includes(v), `${label}: choose from the listed options`) : z.string();
      let s = z.array(item, { error: typeError(label, "a list of choices") });
      if (field.min !== undefined && mode === "submit") s = s.min(field.min, `${label}: choose at least ${field.min}`);
      if (field.max !== undefined) s = s.max(field.max, `${label}: choose at most ${field.max}`);
      return s;
    }
    case "checkbox": {
      const s = z.boolean({ error: typeError(label, "ticked or unticked") });
      return field.required && mode === "submit" ? s.refine((v) => v, `${label} must be ticked`) : s;
    }
    case "boolean":
      return z.boolean({ error: typeError(label, "yes or no") });
    case "date":
      return z.string({ error: typeError(label, "a date") }).regex(DATE_RE, `${label} must be a valid date`);
    case "datetime":
      return z.string({ error: typeError(label, "a date and time") }).regex(DATETIME_RE, `${label} must be a valid date and time`);
    case "time":
      return z.string({ error: typeError(label, "a time") }).regex(TIME_RE, `${label} must be a valid time`);
    case "person":
      return z.string({ error: typeError(label, "a person") }).min(1, `${label}: choose a person`).max(64);
    case "file":
      return z
        .array(
          z
            .object({
              uploadId: z.string().min(1).max(64).optional(),
              attachmentId: z.string().min(1).max(64).optional(),
              fileName: z.string().trim().min(1).max(255),
              sizeBytes: z.number().int().nonnegative().optional(),
            })
            .refine((f) => Boolean(f.uploadId || f.attachmentId), `${label}: upload the file again`),
          { error: typeError(label, "a list of files") },
        )
        .max(field.max ?? 10, `${label}: attach at most ${field.max ?? 10} files`);
    default:
      return z.unknown();
  }
}

export function buildFieldSchema(field: FormFieldDefinition, mode: FormValidationMode = "submit"): z.ZodType {
  const base = baseSchema(field, mode);
  const required = mode === "submit" && field.required;
  return z.preprocess((v) => normalise(field, v), required ? base : base.optional());
}

/**
 * Builds a Zod object schema for the fields that are visible given `values`.
 * Hidden and unknown keys are stripped from the parsed output.
 */
export function buildZodSchema(
  fields: readonly FormFieldDefinition[],
  values: FormValues,
  options: { mode?: FormValidationMode } = {},
): z.ZodObject<Record<string, z.ZodType>> {
  const mode = options.mode ?? "submit";
  const shape: Record<string, z.ZodType> = {};
  for (const field of visibleFields(fields, values)) {
    // Section headings and calculated scores never hold an answer.
    if (isAnswerable(field.type)) shape[field.key] = buildFieldSchema(field, mode);
  }
  return z.object(shape);
}

/** Validates dynamic answers and returns cleaned data (hidden/empty answers removed). */
export function validateFormData(
  fields: readonly FormFieldDefinition[],
  values: FormValues | null | undefined,
  mode: FormValidationMode = "submit",
): FormValidationResult {
  const input = values ?? {};
  const result = buildZodSchema(fields, input, { mode }).safeParse(input);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    };
  }
  return { success: true, data: pruneFormValues(fields, result.data) };
}
