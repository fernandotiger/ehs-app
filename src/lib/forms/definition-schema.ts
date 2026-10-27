import { z } from "zod";
import { FORM_FIELD_TYPES, SHOW_WHEN_OPERATORS, fieldHasOptions, type FormFieldDefinition } from "./types";

const FIELD_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/;

const conditionValue = z.union([z.string().max(200), z.number(), z.boolean()]);

export const formFieldOptionSchema = z.object({
  value: z.string().trim().min(1, "Option value is required").max(200),
  label: z.string().trim().min(1, "Option label is required").max(200),
});

export const showWhenSchema = z.object({
  field: z.string().min(1, "Choose the field this depends on"),
  operator: z.enum(SHOW_WHEN_OPERATORS),
  value: z.union([conditionValue, z.array(conditionValue).max(50)]).optional(),
});

export const formFieldDefinitionSchema = z.object({
  key: z.string().trim().regex(FIELD_KEY_RE, "Keys start with a letter and contain only letters, digits and underscores"),
  label: z.string().trim().min(1, "Label is required").max(200),
  type: z.enum(FORM_FIELD_TYPES),
  required: z.boolean().optional(),
  options: z.array(formFieldOptionSchema).max(100).optional(),
  placeholder: z.string().trim().max(200).optional(),
  helpText: z.string().trim().max(500).optional(),
  section: z.string().trim().max(100).optional(),
  showWhen: showWhenSchema.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  system: z.boolean().optional(),
  searchable: z.boolean().optional(),
  exportable: z.boolean().optional(),
  siteIds: z.array(z.string().min(1).max(64)).max(200).optional(),
});

/**
 * A complete form definition. Structural rules enforced here (shared by Form Builder,
 * the forms API and the questionnaire snapshot):
 * - keys are unique,
 * - option fields have at least one option with unique values,
 * - `showWhen` references an *earlier* field (prevents cycles, keeps forms readable),
 * - `min` ≤ `max`.
 */
export const formSchemaDefinitionSchema = z
  .array(formFieldDefinitionSchema)
  .max(100, "A form can have at most 100 fields")
  .superRefine((fields, ctx) => {
    const seen = new Map<string, number>();
    fields.forEach((field, index) => {
      if (seen.has(field.key)) {
        ctx.addIssue({ code: "custom", path: [index, "key"], message: `Duplicate field key "${field.key}"` });
      }
      if (fieldHasOptions(field.type)) {
        const values = field.options?.map((o) => o.value) ?? [];
        if (values.length === 0) ctx.addIssue({ code: "custom", path: [index, "options"], message: `"${field.label}" needs at least one option` });
        if (new Set(values).size !== values.length) {
          ctx.addIssue({ code: "custom", path: [index, "options"], message: `"${field.label}" has duplicate option values` });
        }
      }
      if (field.showWhen) {
        const parentIndex = seen.get(field.showWhen.field);
        if (parentIndex === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [index, "showWhen", "field"],
            message: `"${field.label}" can only depend on a field above it`,
          });
        }
        const needsValue = !["empty", "notEmpty"].includes(field.showWhen.operator);
        if (needsValue && (field.showWhen.value === undefined || field.showWhen.value === "")) {
          ctx.addIssue({ code: "custom", path: [index, "showWhen", "value"], message: `"${field.label}": choose the value that shows it` });
        }
      }
      if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
        ctx.addIssue({ code: "custom", path: [index, "min"], message: `"${field.label}": minimum is greater than maximum` });
      }
      if (!seen.has(field.key)) seen.set(field.key, index);
    });
  }) as unknown as z.ZodType<FormFieldDefinition[]>;

/** Parses stored JSON (e.g. `IncidentType.formSchema`) defensively; invalid entries are dropped. */
export function parseStoredFormSchema(value: unknown): FormFieldDefinition[] {
  if (!Array.isArray(value)) return [];
  const out: FormFieldDefinition[] = [];
  for (const item of value) {
    const parsed = formFieldDefinitionSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data as FormFieldDefinition);
  }
  return out;
}

/** Suggests a field key from a label, e.g. "PPE worn?" → "ppeWorn". */
export function keyFromLabel(label: string, existing: readonly string[] = []): string {
  const words = label
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join("");
  if (!base || !/^[a-zA-Z]/.test(base)) base = `field${base}`;
  base = base.slice(0, 50);
  let key = base;
  let n = 2;
  while (existing.includes(key)) key = `${base}${n++}`;
  return key;
}
