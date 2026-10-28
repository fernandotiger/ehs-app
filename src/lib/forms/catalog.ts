/**
 * Form Builder catalogue – which modules can own forms, their purposes (Risk: scoring method,
 * Incident: Report/Investigation …), the mandatory module questions and the component palette.
 *
 * Open lists: a later module (Audit, Inspection, Law) flips `available` and adds its settings
 * without changing the Form Builder itself. Framework-free (client, server, seed, tests).
 */
import { RISK_DOMAIN_LABELS, RISK_METHOD_LABELS, type RiskDomain, type RiskMethod } from "../risk/scoring";
import type { FormFieldDefinition, FormFieldOption, FormFieldType } from "./types";

export interface FormPurposeDescriptor {
  key: string;
  label: string;
  description?: string;
}

export interface FormModuleDescriptor {
  /** Module key (src/lib/modules.ts). */
  key: string;
  label: string;
  /** Label of the purpose choice ("Scoring method", "Purpose", "Audit method"). */
  purposeLabel: string;
  purposes: FormPurposeDescriptor[];
  /** False = declared for a later phase: not offered when creating forms yet. */
  available: boolean;
  /** Law: forms can be designed and previewed, no workflow selects them. */
  designOnly?: boolean;
}

export const FORM_MODULES: Record<string, FormModuleDescriptor> = {
  risk: {
    key: "risk",
    label: "Risk",
    purposeLabel: "Scoring method",
    purposes: [
      { key: "5x5", label: RISK_METHOD_LABELS["5x5"], description: "Likelihood × severity, values 1–5." },
      { key: "3x3", label: RISK_METHOD_LABELS["3x3"], description: "Likelihood × severity, values 1–3." },
      { key: "FMEA", label: RISK_METHOD_LABELS.FMEA, description: "Severity, likelihood and detection factor groups (1–10)." },
      { key: "CHECKLIST", label: RISK_METHOD_LABELS.CHECKLIST, description: "Yes / No / Not applicable per hazard." },
    ],
    available: true,
  },
  incidents: {
    key: "incidents",
    label: "Incident",
    purposeLabel: "Purpose",
    purposes: [
      { key: "REPORT", label: "Report", description: "Questions asked when someone reports an incident." },
      { key: "INVESTIGATION", label: "Investigation", description: "Questions answered during the investigation." },
    ],
    available: true,
  },
  actions: {
    key: "actions",
    label: "Action",
    purposeLabel: "Purpose",
    purposes: [{ key: "ACTION", label: "Extra action questions", description: "Questions shown on Create Action, below the standard fields." }],
    available: true,
  },
  audits: {
    key: "audits",
    label: "Audit",
    purposeLabel: "Audit method",
    purposes: [
      { key: "STANDARD", label: "Standard" },
      { key: "SCORABLE", label: "Scorable" },
      { key: "EXPRESS", label: "Express" },
    ],
    available: false,
  },
  inspections: {
    key: "inspections",
    label: "Inspection",
    purposeLabel: "Purpose",
    purposes: [{ key: "INSPECTION", label: "Inspection checklist" }],
    available: false,
  },
  law: {
    key: "law",
    label: "Law",
    purposeLabel: "Purpose",
    purposes: [{ key: "LAW", label: "Legal requirement" }],
    available: false,
    designOnly: true,
  },
};

export function formModule(key: string): FormModuleDescriptor | undefined {
  return Object.prototype.hasOwnProperty.call(FORM_MODULES, key) ? FORM_MODULES[key] : undefined;
}

export function isFormPurpose(module: string, purpose: string): boolean {
  return Boolean(formModule(module)?.purposes.some((p) => p.key === purpose));
}

export function moduleLabel(module: string): string {
  return formModule(module)?.label ?? module;
}

export function purposeLabel(module: string, purpose: string): string {
  return formModule(module)?.purposes.find((p) => p.key === purpose)?.label ?? purpose;
}

/** Modules that can own new forms now (Risk, Incident and Actions). */
export function creatableModules(): FormModuleDescriptor[] {
  return Object.values(FORM_MODULES).filter((m) => m.available);
}

// ── Mandatory module questions ──────────────────────────────────────────────

type SystemQuestion = Pick<FormFieldDefinition, "key" | "label" | "type" | "options" | "helpText">;

const ratingOptions = (labels: string[]): FormFieldOption[] => labels.map((label, i) => ({ value: String(i + 1), label: `${i + 1} · ${label}` }));

const LIKELIHOOD: Record<RiskMethod, FormFieldOption[]> = {
  "5x5": ratingOptions(["Rare", "Unlikely", "Possible", "Likely", "Almost certain"]),
  "3x3": ratingOptions(["Unlikely", "Possible", "Likely"]),
  FMEA: Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  CHECKLIST: ratingOptions(["Rare", "Unlikely", "Possible", "Likely", "Almost certain"]),
};

const SEVERITY: Record<RiskMethod, FormFieldOption[]> = {
  "5x5": ratingOptions(["Minor", "Moderate", "Serious", "Major", "Catastrophic"]),
  "3x3": ratingOptions(["Minor", "Serious", "Major"]),
  FMEA: Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  CHECKLIST: ratingOptions(["Minor", "Moderate", "Serious", "Major", "Catastrophic"]),
};

const SCORE_HELP: Record<RiskMethod, string> = {
  "5x5": "Calculated as likelihood × severity for each hazard; the highest hazard score is the assessment score.",
  "3x3": "Calculated as likelihood × severity for each hazard; the highest hazard score is the assessment score.",
  FMEA: "Calculated from the average severity, likelihood and detection factor ratings (up to 1,000).",
  CHECKLIST: "Each hazard answered No needs action; the assessment shows Satisfactory or Action required.",
};

function riskQuestions(method: RiskMethod, domain: RiskDomain): SystemQuestion[] {
  return [
    { key: "riskTitle", label: "Risk title", type: "text" },
    domain === "ENVIRONMENT"
      ? { key: "hazard", label: "Environmental aspect and impact", type: "textarea" }
      : { key: "hazard", label: "Hazard and potential harm", type: "textarea" },
    { key: "site", label: "Site or location", type: "text" },
    { key: "likelihood", label: "Likelihood", type: "select", options: LIKELIHOOD[method] },
    { key: "severity", label: "Severity", type: "select", options: SEVERITY[method] },
    { key: "riskScore", label: "Risk score", type: "score", helpText: SCORE_HELP[method] },
    { key: "owner", label: "Assigned owner", type: "person" },
    { key: "reviewDate", label: "Review date", type: "date" },
  ];
}

const INCIDENT_REPORT: SystemQuestion[] = [
  { key: "incidentTitle", label: "Incident title", type: "text" },
  { key: "occurredAt", label: "Date and time of event", type: "datetime" },
  { key: "site", label: "Site or location", type: "text" },
  { key: "whatHappened", label: "What happened?", type: "textarea" },
];

const INCIDENT_INVESTIGATION: SystemQuestion[] = [
  { key: "investigationFindings", label: "Investigation findings", type: "textarea" },
  { key: "rootCauseAnalysis", label: "Root cause analysis", type: "textarea" },
];

// Declared for later phases (not creatable yet).
const AUDIT: SystemQuestion[] = [
  { key: "auditTitle", label: "Audit title", type: "text" },
  { key: "site", label: "Site or location", type: "text" },
  { key: "scheduledDate", label: "Scheduled date", type: "date" },
  { key: "leadAuditor", label: "Lead auditor", type: "person" },
  { key: "scope", label: "Scope and objectives", type: "textarea" },
];
const INSPECTION: SystemQuestion[] = [
  { key: "inspectionTitle", label: "Inspection title", type: "text" },
  { key: "site", label: "Site or location", type: "text" },
  { key: "inspectionDate", label: "Inspection date", type: "date" },
  { key: "inspector", label: "Inspector", type: "person" },
  { key: "area", label: "Area or equipment", type: "text" },
];
const LAW: SystemQuestion[] = [
  { key: "requirementTitle", label: "Requirement title", type: "text" },
  { key: "jurisdiction", label: "Jurisdiction", type: "text" },
  { key: "summary", label: "Requirement summary", type: "textarea" },
  { key: "owner", label: "Responsible owner", type: "person" },
  {
    key: "complianceStatus",
    label: "Compliance status",
    type: "select",
    options: ["To assess", "Compliant", "Action required", "Not applicable"].map((l) => ({ value: l.toLowerCase().replace(/\s+/g, "-"), label: l })),
  },
  { key: "reviewDate", label: "Review date", type: "date" },
];

/**
 * The mandatory questions for a module/purpose, in their default order. They are `system`
 * fields: required, not deletable, not renamable (order and help text can change).
 * Risk depends on the method (purpose) and the domain setting.
 */
export function systemQuestions(module: string, purpose: string, settings?: Record<string, unknown> | null): FormFieldDefinition[] {
  let list: SystemQuestion[] = [];
  if (module === "risk") {
    const domain = (settings?.domain as RiskDomain | undefined) ?? "HEALTH_SAFETY";
    list = riskQuestions(purpose as RiskMethod, domain in RISK_DOMAIN_LABELS ? domain : "HEALTH_SAFETY");
  } else if (module === "incidents") list = purpose === "INVESTIGATION" ? INCIDENT_INVESTIGATION : INCIDENT_REPORT;
  else if (module === "audits") list = AUDIT;
  else if (module === "inspections") list = INSPECTION;
  else if (module === "law") list = LAW;
  return list.map((q) => ({ ...q, required: q.type !== "score", system: true, ...(q.options ? { options: q.options.map((o) => ({ ...o })) } : {}) }));
}

/**
 * Re-applies the canonical definition to the system fields of a draft (label, type, required,
 * options) while keeping the designer's order and help text. Missing system fields are reported.
 * Fields that claim `system` but are not mandatory questions become ordinary questions.
 */
export function enforceSystemQuestions(
  module: string,
  purpose: string,
  settings: Record<string, unknown> | null | undefined,
  fields: readonly FormFieldDefinition[],
): { fields: FormFieldDefinition[]; missing: FormFieldDefinition[] } {
  const canonical = new Map(systemQuestions(module, purpose, settings).map((q) => [q.key, q]));
  const seen = new Set<string>();
  const out = fields.map((field) => {
    const system = canonical.get(field.key);
    if (!system) {
      if (!field.system) return field;
      const rest = { ...field };
      delete rest.system;
      return rest;
    }
    seen.add(field.key);
    return {
      ...system,
      ...(field.helpText !== undefined ? { helpText: field.helpText } : system.helpText ? { helpText: system.helpText } : {}),
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      ...(field.searchable !== undefined ? { searchable: field.searchable } : {}),
      ...(field.exportable !== undefined ? { exportable: field.exportable } : {}),
    };
  });
  const missing = [...canonical.values()].filter((q) => !seen.has(q.key));
  return { fields: out, missing };
}

// ── Components palette ──────────────────────────────────────────────────────

export interface PaletteItem {
  type: FormFieldType;
  label: string;
  hint: string;
}

/** Components offered by the designer (the calculated score is a Risk system question only). */
export const PALETTE: PaletteItem[] = [
  { type: "text", label: "Short text", hint: "Single line" },
  { type: "textarea", label: "Long text", hint: "Paragraph" },
  { type: "number", label: "Number", hint: "Numeric value" },
  { type: "date", label: "Date", hint: "Calendar date" },
  { type: "datetime", label: "Date & time", hint: "Event time" },
  { type: "select", label: "Dropdown", hint: "One option" },
  { type: "multiselect", label: "Multiple choice", hint: "Several options" },
  { type: "boolean", label: "Yes / No", hint: "Binary answer" },
  { type: "person", label: "Person", hint: "Someone in the directory" },
  { type: "file", label: "File upload", hint: "Attachment" },
  { type: "heading", label: "Section heading", hint: "Group questions" },
];

export const PALETTE_TYPES: readonly FormFieldType[] = PALETTE.map((p) => p.type);

/** Types that show a placeholder setting. */
export function hasPlaceholder(type: FormFieldType): boolean {
  return ["text", "textarea", "number"].includes(type);
}

function randomKey(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `q_${random.slice(0, 10)}`;
}

/** A unique field key for a new or copied question. */
export function newFieldKey(existing: readonly string[]): string {
  let key = randomKey();
  while (existing.includes(key)) key = randomKey();
  return key;
}

/** A new question of `type` (from the palette). */
export function newField(type: FormFieldType, existingKeys: readonly string[]): FormFieldDefinition {
  const key = newFieldKey(existingKeys);
  if (type === "heading") return { key, label: "New section", type };
  const field: FormFieldDefinition = { key, label: "Untitled question", type, required: false };
  if (type === "select" || type === "multiselect") {
    field.options = [
      { value: "option-1", label: "Option 1" },
      { value: "option-2", label: "Option 2" },
    ];
  }
  return field;
}

/** Initial draft design for a new form: the mandatory questions. */
export function initialFields(module: string, purpose: string, settings?: Record<string, unknown> | null): FormFieldDefinition[] {
  return systemQuestions(module, purpose, settings);
}

/** Number of questions (section headings are not questions). */
export function questionCount(fields: readonly FormFieldDefinition[]): number {
  return fields.filter((f) => f.type !== "heading").length;
}
