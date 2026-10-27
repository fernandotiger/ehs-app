import { z } from "zod";
import type { ModuleKey } from "./modules";

/**
 * Pick-list catalogue. Lists are declared here (code); their VALUES are tenant data
 * (`LookupValue`), seeded from `defaults` when a tenant is provisioned and editable in
 * Configuration → Lists. Modules add their lists (e.g. "incident.injury-type") with a group
 * matching their module. Safe for client and server.
 */
export interface LookupDefault {
  label: string;
  code?: string;
  notes?: string;
  color?: string;
}

export interface LookupListDescriptor {
  key: string;
  /** Heading the list is shown under in Configuration → Lists. */
  group: string;
  name: string;
  description: string;
  /** The list only matters when this module is enabled (omit = always). */
  module?: ModuleKey;
  defaults: LookupDefault[];
}

export const LOOKUP_LISTS = {
  "general.category": {
    key: "general.category",
    group: "General",
    name: "Categories",
    description: "Named classifications used across the company.",
    defaults: [
      { label: "Health & Safety" },
      { label: "Environment" },
      { label: "Quality" },
      { label: "Security" },
    ],
  },
  "general.template": {
    key: "general.template",
    group: "General",
    name: "Templates",
    description: "A simple directory of named templates (separate from Form Builder questionnaires).",
    defaults: [{ label: "Toolbox talk" }, { label: "Site induction" }],
  },

  // ── Incidents ──────────────────────────────────────────────────────────────
  // Causes live in one list per fixed cause group (Equipment, Materials, Methods, People, Workplace).
  "incident.cause.equipment": {
    key: "incident.cause.equipment",
    group: "Incidents",
    name: "Causes · Equipment",
    description: "Contributing causes in the Equipment group (chosen on investigations).",
    module: "incidents",
    defaults: [{ label: "Defective equipment" }, { label: "Inadequate guarding" }],
  },
  "incident.cause.materials": {
    key: "incident.cause.materials",
    group: "Incidents",
    name: "Causes · Materials",
    description: "Contributing causes in the Materials group.",
    module: "incidents",
    defaults: [{ label: "Poor labelling or storage" }, { label: "Unsuitable material" }],
  },
  "incident.cause.methods": {
    key: "incident.cause.methods",
    group: "Incidents",
    name: "Causes · Methods",
    description: "Contributing causes in the Methods group.",
    module: "incidents",
    defaults: [{ label: "Inadequate procedure" }, { label: "Insufficient maintenance" }],
  },
  "incident.cause.people": {
    key: "incident.cause.people",
    group: "Incidents",
    name: "Causes · People",
    description: "Contributing causes in the People group.",
    module: "incidents",
    defaults: [{ label: "Training gap" }, { label: "PPE not used" }],
  },
  "incident.cause.workplace": {
    key: "incident.cause.workplace",
    group: "Incidents",
    name: "Causes · Workplace",
    description: "Contributing causes in the Workplace group.",
    module: "incidents",
    defaults: [{ label: "Poor signage" }, { label: "Poor housekeeping" }, { label: "Unsafe layout" }],
  },
  "incident.reportee.internal": {
    key: "incident.reportee.internal",
    group: "Incidents",
    name: "Reportees · Internal",
    description: "Internal people or teams a reportable incident is reported to. Notes = destination / channel. Selecting one records intent only.",
    module: "incidents",
    defaults: [{ label: "EHS leadership", notes: "EHS leadership mailbox (example)" }],
  },
  "incident.reportee.external": {
    key: "incident.reportee.external",
    group: "Incidents",
    name: "Reportees · External",
    description: "External bodies (e.g. a regulator). Notes = destination / reporting channel. Nothing is sent automatically.",
    module: "incidents",
    defaults: [{ label: "External regulator (example)", notes: "Official reporting portal – example only" }],
  },
  "incident.capa-category": {
    key: "incident.capa-category",
    group: "Incidents",
    name: "Action categories",
    description: "Categories for corrective and preventive actions.",
    module: "incidents",
    defaults: [
      { label: "Engineering control" },
      { label: "Administrative control" },
      { label: "Training" },
      { label: "PPE" },
      { label: "Process improvement" },
      { label: "Maintenance" },
    ],
  },
  "incident.hazard-group": {
    key: "incident.hazard-group",
    group: "Incidents",
    name: "Hazard groups",
    description: "Health & safety hazard groups recorded on investigations.",
    module: "incidents",
    defaults: [
      { label: "Work equipment" },
      { label: "Workplace transport" },
      { label: "Manual handling" },
      { label: "Slips, trips and falls" },
      { label: "Hazardous substances" },
      { label: "Electrical" },
      { label: "Working at height" },
      { label: "Fire" },
    ],
  },
  "incident.environmental-aspect": {
    key: "incident.environmental-aspect",
    group: "Incidents",
    name: "Environmental aspects",
    description: "Environmental aspects recorded on investigations.",
    module: "incidents",
    defaults: [
      { label: "Oil storage and handling" },
      { label: "Waste management" },
      { label: "Emissions to air" },
      { label: "Discharges to water" },
      { label: "Noise" },
      { label: "Energy use" },
    ],
  },
  "incident.shift": {
    key: "incident.shift",
    group: "Incidents",
    name: "Shifts",
    description: "Shift choices on incident reports.",
    module: "incidents",
    defaults: [{ label: "Day" }, { label: "Evening" }, { label: "Night" }, { label: "Weekend" }],
  },
  "incident.injury-type": {
    key: "incident.injury-type",
    group: "Incidents",
    name: "Injury types",
    description: "Optional injury type for injured people (free-text injury details stay available).",
    module: "incidents",
    defaults: [{ label: "Cut or laceration" }, { label: "Bruise" }, { label: "Sprain or strain" }, { label: "Fracture" }, { label: "Burn" }, { label: "Other" }],
  },
  "incident.body-part": {
    key: "incident.body-part",
    group: "Incidents",
    name: "Body parts",
    description: "Optional body part for injured people.",
    module: "incidents",
    defaults: [{ label: "Head" }, { label: "Eye" }, { label: "Hand or finger" }, { label: "Arm" }, { label: "Back" }, { label: "Leg" }, { label: "Foot" }, { label: "Multiple" }],
  },
  "incident.absence-kind": {
    key: "incident.absence-kind",
    group: "Incidents",
    name: "Absence kinds",
    description: "Kinds of absence periods on investigations. Values with code RESTRICTED (Restricted duties) are not counted as days lost.",
    module: "incidents",
    defaults: [{ label: "Lost time injury" }, { label: "Restricted duties", code: "RESTRICTED" }, { label: "Sick leave" }, { label: "Other" }],
  },

  // ── Risk ───────────────────────────────────────────────────────────────────
  "risk.activity-type": {
    key: "risk.activity-type",
    group: "Risk",
    name: "Activity / item types",
    description: "What an assessment covers (the identity, e.g. “Ladder LAD-001”, is typed on the assessment).",
    module: "risk",
    defaults: [{ label: "Process or activity" }, { label: "Equipment" }, { label: "Substance" }, { label: "Location or area" }, { label: "Job role" }],
  },
  "risk.operation-mode": {
    key: "risk.operation-mode",
    group: "Risk",
    name: "Operation modes",
    description: "Under which conditions the activity is carried out.",
    module: "risk",
    defaults: [{ label: "Routine" }, { label: "Non-routine" }, { label: "Maintenance" }, { label: "Emergency" }],
  },
  "risk.work-area": {
    key: "risk.work-area",
    group: "Risk",
    name: "Work areas",
    description: "Where the assessed work takes place.",
    module: "risk",
    defaults: [{ label: "Workshop" }, { label: "Production line" }, { label: "Warehouse" }, { label: "Loading bay" }, { label: "Office" }, { label: "Outdoor yard" }, { label: "Maintenance store" }],
  },
  "risk.objective-domain": {
    key: "risk.objective-domain",
    group: "Risk",
    name: "Objective domains",
    description: "Domains for objectives (Objectives & programmes).",
    module: "risk",
    defaults: [{ label: "Health & Safety" }, { label: "Environment" }, { label: "Energy" }, { label: "Quality" }],
  },
  "risk.target-unit": {
    key: "risk.target-unit",
    group: "Risk",
    name: "Target units",
    description: "Units of measurement for targets.",
    module: "risk",
    defaults: [{ label: "%" }, { label: "observation points" }, { label: "incidents" }, { label: "assessments" }, { label: "tonnes" }, { label: "kWh" }, { label: "m³" }],
  },
} as const satisfies Record<string, LookupListDescriptor>;

export type LookupListKey = keyof typeof LOOKUP_LISTS;

export const LOOKUP_LIST_KEYS = Object.keys(LOOKUP_LISTS) as LookupListKey[];

export function isLookupListKey(value: string): value is LookupListKey {
  return Object.prototype.hasOwnProperty.call(LOOKUP_LISTS, value);
}

export function lookupList(key: LookupListKey): LookupListDescriptor {
  return LOOKUP_LISTS[key];
}

/** A list value as returned by the API. */
export interface LookupValueDto {
  id: string;
  listKey: string;
  label: string;
  code: string | null;
  notes: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
}

// ── Validation (shared by Configuration → Lists and the API) ────────────────

const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #3B5382");

export const lookupValueSchema = z.object({
  label: z.string().trim().min(1, "Enter a name").max(120),
  code: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  color: hexColour.nullish(),
});
export type LookupValueInput = z.infer<typeof lookupValueSchema>;

export const lookupValueUpdateSchema = lookupValueSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type LookupValueUpdateInput = z.infer<typeof lookupValueUpdateSchema>;

export const lookupReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
});

/** Case-insensitive, whitespace-normalised comparison key for duplicate detection. */
export function normaliseLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
