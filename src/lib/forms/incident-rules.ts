/**
 * Incident duplicate-field rule (spec form-builder.md "Incident duplicate-field rule").
 *
 * Default workflow information appears once: an Incident form must not add a custom question
 * that repeats a standard incident control (severity, department, investigators …) or one of the
 * form's mandatory questions. Labels are compared after normalisation (case, spacing,
 * punctuation, "&" → "and") against an explicit alias table – no fuzzy matching, so distinct
 * questions such as "Describe equipment damage" stay allowed.
 */
import type { FormFieldDefinition } from "./types";

export type IncidentPurpose = "REPORT" | "INVESTIGATION";

/** "  H&S Impact " → "h and s impact"; "What happened?" → "what happened". */
export function normaliseLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

interface DefaultControl {
  /** Name shown in messages, e.g. "Severity". */
  name: string;
  /** Where it already lives. */
  source: "report" | "investigation" | "question";
  /** Mandatory question key when `source = question`. */
  key?: string;
  aliases: string[];
}

/** Controls of the standard incident report (already on every incident). */
const REPORT_DEFAULTS: DefaultControl[] = [
  { name: "Incident type", source: "report", aliases: ["incident type", "type", "type of incident", "event type"] },
  { name: "Incident subtype", source: "report", aliases: ["incident subtype", "incident sub type", "subtype", "sub type"] },
  { name: "Severity", source: "report", aliases: ["severity", "incident severity", "severity level"] },
  { name: "Department", source: "report", aliases: ["department", "dept"] },
  { name: "Precise location", source: "report", aliases: ["precise location", "exact location", "specific location"] },
  { name: "Shift", source: "report", aliases: ["shift", "work shift"] },
  {
    name: "Investigation target date",
    source: "report",
    aliases: ["investigation target date", "investigation target close date", "investigation due date", "target close date"],
  },
  {
    name: "Assigned investigators",
    source: "report",
    aliases: ["assigned investigators", "assigned investigator", "assigned to", "investigator", "investigators"],
  },
  { name: "Notification recipients", source: "report", aliases: ["notification recipients", "notify", "people to notify", "notify people"] },
  { name: "People involved", source: "report", aliases: ["people involved", "persons involved", "people"] },
  { name: "Immediate action", source: "report", aliases: ["immediate action", "immediate actions", "immediate action taken", "immediate response"] },
  {
    name: "First aid / treatment / outcome",
    source: "report",
    aliases: ["first aid", "first aid outcome", "first aid treatment", "first aid treatment outcome", "treatment outcome"],
  },
  {
    name: "Nurse notified",
    source: "report",
    aliases: ["nurse notified", "nurse notification", "was the nurse notified", "occupational health notified", "was occupational health notified"],
  },
  { name: "Confidential", source: "report", aliases: ["confidential", "confidentiality", "mark as confidential"] },
];

/** Controls of the standard investigation. */
const INVESTIGATION_DEFAULTS: DefaultControl[] = [
  { name: "Health & safety impact", source: "investigation", aliases: ["health and safety impact", "h and s impact", "hs impact", "safety impact"] },
  { name: "Environmental impact", source: "investigation", aliases: ["environmental impact", "environment impact"] },
  { name: "Impact details", source: "investigation", aliases: ["impact details", "impact detail"] },
  { name: "Contributing causes", source: "investigation", aliases: ["contributing causes", "contributing cause", "cause types", "cause type", "basic cause types", "basic cause type", "causes"] },
  { name: "Reportable", source: "investigation", aliases: ["reportable", "is it reportable", "reportability", "reportable incident"] },
  { name: "Reportees", source: "investigation", aliases: ["reportees", "reported to", "reportable to", "authorities notified"] },
  {
    name: "Loss periods",
    source: "investigation",
    aliases: ["number of days lost", "days lost", "lost days", "lost time days", "loss period", "loss periods"],
  },
  { name: "Loss totals", source: "investigation", aliases: ["total loss", "loss total", "loss totals", "total cost of loss", "cost of loss"] },
  { name: "Action required", source: "investigation", aliases: ["action required", "actions required", "is action required", "corrective action required"] },
  { name: "Closing decision", source: "investigation", aliases: ["closing decision", "closure decision", "close incident", "ready to close"] },
];

/** Mandatory questions (by key) and the labels that mean the same thing. */
const REPORT_QUESTIONS: DefaultControl[] = [
  // A short "Description" (used as the title in the source system) is the Incident title …
  { name: "Incident title", source: "question", key: "incidentTitle", aliases: ["incident title", "title", "incident name"] },
  { name: "Date and time of event", source: "question", key: "occurredAt", aliases: ["date and time of event", "date time of event", "event date", "incident date", "date of incident", "date and time", "when did it happen"] },
  { name: "Site or location", source: "question", key: "site", aliases: ["site or location", "site", "location", "site location"] },
  // … while the narrative description is "What happened?".
  {
    name: "What happened?",
    source: "question",
    key: "whatHappened",
    aliases: ["what happened", "description free text field", "narrative", "incident description", "event description", "description of what happened"],
  },
];

const INVESTIGATION_QUESTIONS: DefaultControl[] = [
  { name: "Investigation findings", source: "question", key: "investigationFindings", aliases: ["investigation findings", "findings"] },
  { name: "Root cause analysis", source: "question", key: "rootCauseAnalysis", aliases: ["root cause analysis", "root cause", "rca"] },
];

function controlsFor(purpose: IncidentPurpose): DefaultControl[] {
  // An investigation sits on the incident report, so report-level controls count there too.
  return purpose === "INVESTIGATION"
    ? [...REPORT_DEFAULTS, ...INVESTIGATION_DEFAULTS, ...INVESTIGATION_QUESTIONS, ...REPORT_QUESTIONS]
    : [...REPORT_DEFAULTS, ...REPORT_QUESTIONS];
}

/** Which default/mandatory control a label stands for ("description" depends on the question type). */
export function canonicalControl(label: string, type: FormFieldDefinition["type"], purpose: IncidentPurpose): DefaultControl | null {
  const normalised = normaliseLabel(label);
  if (!normalised) return null;
  const controls = controlsFor(purpose);
  if (normalised === "description") {
    const key = type === "text" ? "incidentTitle" : "whatHappened";
    return controls.find((c) => c.key === key) ?? null;
  }
  return controls.find((c) => c.aliases.includes(normalised)) ?? null;
}

export interface IncidentConflict {
  key: string;
  label: string;
  message: string;
}

/**
 * Conflict for one (custom) question within `fields`, or null.
 * `selfKey` is the question's own key when it is already in the form.
 */
export function incidentFieldConflict(
  candidate: Pick<FormFieldDefinition, "label" | "type">,
  purpose: IncidentPurpose,
  fields: readonly FormFieldDefinition[],
  selfKey?: string,
): string | null {
  if (candidate.type === "heading") return null;
  const label = candidate.label.trim();
  const control = canonicalControl(label, candidate.type, purpose);
  if (control) {
    if (control.source === "question") {
      if (control.key === selfKey) return null;
      const existing = fields.find((f) => f.key === control.key);
      return `"${label}" repeats the required question "${existing?.label ?? control.name}" already in this form. Use that question instead.`;
    }
    const where = control.source === "report" ? "the standard incident report" : "the standard investigation";
    return `"${label}" is already part of ${where} ("${control.name}"). Use that field instead of adding a question.`;
  }
  const normalised = normaliseLabel(label);
  const twin = fields.find((f) => f.key !== selfKey && f.type !== "heading" && normaliseLabel(f.label) === normalised);
  return twin ? `"${label}" duplicates the question "${twin.label}" already in this form.` : null;
}

/** Every conflicting custom question of a form (system questions are never reported). */
export function incidentConflicts(fields: readonly FormFieldDefinition[], purpose: IncidentPurpose): IncidentConflict[] {
  const conflicts: IncidentConflict[] = [];
  fields.forEach((field, index) => {
    if (field.system || field.type === "heading") return;
    // Only compare with questions above, so the second copy is the one reported.
    const message = incidentFieldConflict(field, purpose, fields.slice(0, index).concat(fields.filter((f) => f.system)), field.key);
    if (message) conflicts.push({ key: field.key, label: field.label, message });
  });
  return conflicts;
}

/**
 * Keys of questions in a captured (possibly older) questionnaire that repeat a default control.
 * The Incident workflow uses its canonical control instead and hides these inputs, keeping the
 * historical answers.
 */
export function repeatedDefaultKeys(fields: readonly FormFieldDefinition[], purpose: IncidentPurpose): string[] {
  return incidentConflicts(fields, purpose).map((c) => c.key);
}
