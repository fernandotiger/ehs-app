import { isAnswerable, type ConditionValue, type FormFieldDefinition, type FormValues, type ShowWhenCondition } from "./types";

/** An answer counts as empty when it is missing, blank, or an empty list. */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Loose comparison so "5" (from a select) matches 5 and "true" matches true. */
function sameValue(a: unknown, b: ConditionValue): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return false;
  return String(a) === String(b);
}

function matchesAny(actual: unknown, expected: ConditionValue[]): boolean {
  const actualValues = Array.isArray(actual) ? actual : [actual];
  return actualValues.some((a) => expected.some((e) => sameValue(a, e)));
}

export function evaluateCondition(condition: ShowWhenCondition, values: FormValues): boolean {
  const actual = values[condition.field];
  const expected = condition.value === undefined ? [] : Array.isArray(condition.value) ? condition.value : [condition.value];
  switch (condition.operator) {
    case "empty":
      return isEmptyValue(actual);
    case "notEmpty":
      return !isEmptyValue(actual);
    case "equals":
    case "in":
      return matchesAny(actual, expected);
    case "notEquals":
      return !isEmptyValue(actual) && !matchesAny(actual, expected);
    default:
      return true;
  }
}

/**
 * Whether a field is visible for the current answers.
 *
 * Visibility is transitive: a field whose controlling field is itself hidden is also
 * hidden (otherwise a stale answer on a hidden parent could reveal a child). Cycles are
 * treated as hidden.
 */
export function isFieldVisible(field: FormFieldDefinition, fields: readonly FormFieldDefinition[], values: FormValues): boolean {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const seen = new Set<string>();
  let current: FormFieldDefinition | undefined = field;
  while (current?.showWhen) {
    if (seen.has(current.key)) return false;
    seen.add(current.key);
    if (!evaluateCondition(current.showWhen, values)) return false;
    current = byKey.get(current.showWhen.field);
  }
  return true;
}

export function visibleFields(fields: readonly FormFieldDefinition[], values: FormValues): FormFieldDefinition[] {
  return fields.filter((f) => isFieldVisible(f, fields, values));
}

/** Keeps only answers for known, currently visible fields that are not empty. */
export function pruneFormValues(fields: readonly FormFieldDefinition[], values: FormValues): FormValues {
  const out: FormValues = {};
  for (const field of visibleFields(fields, values)) {
    if (!isAnswerable(field.type)) continue;
    const value = values[field.key];
    if (!isEmptyValue(value)) out[field.key] = value;
  }
  return out;
}
