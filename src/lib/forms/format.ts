import type { FormFieldDefinition } from "./types";
import { isEmptyValue } from "./visibility";

function optionLabel(field: FormFieldDefinition, value: unknown): string {
  const match = field.options?.find((o) => o.value === String(value));
  return match?.label ?? String(value);
}

/**
 * Human readable answer, used for read-only views and CSV export. Returns an empty string for
 * unanswered fields. Person answers are user ids – resolve names where they are displayed.
 */
export function formatAnswer(field: FormFieldDefinition, value: unknown): string {
  if (isEmptyValue(value)) return "";
  switch (field.type) {
    case "boolean":
      return value === true || value === "true" ? "Yes" : "No";
    case "checkbox":
      return value === true || value === "true" ? "Ticked" : "Not ticked";
    case "select":
    case "radio":
      return optionLabel(field, value);
    case "multiselect":
      return (Array.isArray(value) ? value : [value]).map((v) => optionLabel(field, v)).join(", ");
    case "datetime":
      return String(value).replace("T", " ").slice(0, 16);
    case "file":
      return (Array.isArray(value) ? value : [value])
        .map((f) => (f && typeof f === "object" && "fileName" in f ? String((f as { fileName: unknown }).fileName) : String(f)))
        .join(", ");
    default:
      return String(value);
  }
}
