/**
 * Dynamic form engine – field definitions.
 *
 * Form Builder (`src/server/modules/forms`) stores an array of `FormFieldDefinition` per form
 * version. The same definitions drive the client renderer (`QuestionnaireForm`), validation
 * (client and server) and are captured as a snapshot on the record that uses them.
 *
 * Framework-free: safe to import from client components, server code and tests.
 */

export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "multiselect",
  "radio",
  "checkbox",
  "date",
  "datetime",
  "time",
  "boolean",
  /** A person from the company directory (answer = user id). */
  "person",
  /** Files attached through the shared evidence flow (answer = FileAnswer[]). */
  "file",
  /** Groups the questions below it; never answered. */
  "heading",
  /** Calculated by the module workflow (e.g. Risk score); never answered directly. */
  "score",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** Human labels for the form builder. */
export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  select: "Dropdown",
  multiselect: "Multiple choice",
  radio: "Single choice (radio)",
  checkbox: "Tick box",
  date: "Date",
  datetime: "Date & time",
  time: "Time",
  boolean: "Yes / No",
  person: "Person",
  file: "File upload",
  heading: "Section heading",
  score: "Calculated score",
};

/** Field types that never hold an answer. */
export const NON_ANSWER_FIELD_TYPES: readonly FormFieldType[] = ["heading", "score"];

export function isAnswerable(type: FormFieldType): boolean {
  return !NON_ANSWER_FIELD_TYPES.includes(type);
}

/** Answer of a `file` question: an upload (before the record is saved) or an existing attachment. */
export interface FileAnswer {
  /** Two-phase upload id (`uploadFile(file, "evidence")`); the module consumes it when saving. */
  uploadId?: string;
  /** Attachment id once the module has stored the file as evidence. */
  attachmentId?: string;
  fileName: string;
  sizeBytes?: number;
}

/** Field types whose answers come from a fixed list of options. */
export const OPTION_FIELD_TYPES: readonly FormFieldType[] = ["select", "multiselect", "radio"];

export function fieldHasOptions(type: FormFieldType): boolean {
  return OPTION_FIELD_TYPES.includes(type);
}

export interface FormFieldOption {
  value: string;
  label: string;
}

export const SHOW_WHEN_OPERATORS = ["equals", "notEquals", "in", "notEmpty", "empty"] as const;
export type ShowWhenOperator = (typeof SHOW_WHEN_OPERATORS)[number];

export const SHOW_WHEN_OPERATOR_LABELS: Record<ShowWhenOperator, string> = {
  equals: "is",
  notEquals: "is not",
  in: "is one of",
  notEmpty: "has an answer",
  empty: "has no answer",
};

/** Primitive value a condition compares against. */
export type ConditionValue = string | number | boolean;

/**
 * Conditional visibility: show this field only when another field's answer matches.
 * For multiselect sources, `equals`/`in` match when any selected value matches.
 */
export interface ShowWhenCondition {
  field: string;
  operator: ShowWhenOperator;
  value?: ConditionValue | ConditionValue[];
}

export interface FormFieldDefinition {
  /** Stable key used in `formData` (letters, digits, underscore). */
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: FormFieldOption[];
  placeholder?: string;
  helpText?: string;
  /** Optional grouping heading in the renderer. */
  section?: string;
  showWhen?: ShowWhenCondition;
  /**
   * number → value range; text/textarea → length; multiselect → number of selections.
   */
  min?: number;
  max?: number;
  /**
   * Mandatory module question (Form Builder): cannot be deleted, renamed or made optional;
   * order and help text can change. Modules map it by `key`.
   */
  system?: boolean;
  /** Incident: answers can be used by incident search. */
  searchable?: boolean;
  /** Incident: included in the custom-column CSV export (default true). */
  exportable?: boolean;
  /** Sites where the question applies. Empty/missing = every site. */
  siteIds?: string[];
}

/** Answer value shapes by field type. */
export type FormValue = string | number | boolean | string[] | null | undefined;
export type FormValues = Record<string, unknown>;
