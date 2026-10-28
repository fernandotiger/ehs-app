import type { z } from "zod";
import { PERMISSIONS, type Permission } from "../permissions";
import { DEFAULT_DOCUMENT_SURVEY_SETTINGS, documentSurveySettingsSchema } from "./document-survey";
import { DEFAULT_INCIDENT_SETTINGS, incidentSettingsSchema } from "./incident";
import { DEFAULT_NUMBERING_SETTINGS, numberingSettingsSchema } from "./numbering";
import { DEFAULT_SYSTEM_SETTINGS, systemSettingsSchema } from "./system";

/**
 * Settings registry – every tenant setting is a typed JSON document stored in `OrgSetting`
 * under one of these keys. Modules add their key here (e.g. "incident") with a zod schema,
 * defaults, a label and the permission needed to change it. Safe for client and server.
 *
 * Reading: any signed-in user (values are configuration, not personal data).
 * Writing: `settingsService.update(key, value, actor, meta)` – validated and audited.
 */
export interface SettingDefinition<S extends z.ZodType = z.ZodType> {
  label: string;
  description: string;
  schema: S;
  defaults: z.infer<S>;
  /** Permission required to change the value. */
  permission: Permission;
  /** Merge stored values over defaults: "shallow" (object fields) or "entries" (record of objects). */
  merge: "shallow" | "entries";
}

function define<S extends z.ZodType>(definition: SettingDefinition<S>): SettingDefinition<S> {
  return definition;
}

export const SETTINGS = {
  system: define({
    label: "System settings",
    description: "Upload limits and acknowledgement defaults.",
    schema: systemSettingsSchema,
    defaults: DEFAULT_SYSTEM_SETTINGS,
    permission: PERMISSIONS.ADMIN_SETTINGS,
    merge: "shallow",
  }),
  documentSurvey: define({
    label: "Employee inductions",
    description: "Anonymity threshold and the default \"complete within\" days for employee inductions (document surveys).",
    schema: documentSurveySettingsSchema,
    defaults: DEFAULT_DOCUMENT_SURVEY_SETTINGS,
    permission: PERMISSIONS.ADMIN_SETTINGS,
    merge: "shallow",
  }),
  numbering: define({
    label: "Reference numbers",
    description: "Prefix, year and padding for reference numbers such as INC-2026-0001.",
    schema: numberingSettingsSchema,
    defaults: DEFAULT_NUMBERING_SETTINGS,
    permission: PERMISSIONS.CONFIG_LISTS,
    merge: "entries",
  }),
  incident: define({
    label: "Incident settings",
    description: "Ordered columns for incident CSV exports (standard columns and exportable custom answers).",
    schema: incidentSettingsSchema,
    defaults: DEFAULT_INCIDENT_SETTINGS,
    permission: PERMISSIONS.INCIDENT_CONFIGURE,
    merge: "shallow",
  }),
};

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(value: string): value is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, value);
}

/**
 * Stored JSON → value: stored fields win over defaults, unknown/invalid stored data falls back
 * to the defaults (a broken row never breaks the app). Pure – shared by server and tests.
 */
export function resolveSetting<K extends SettingKey>(key: K, stored: unknown): SettingValue<K> {
  const def = SETTINGS[key] as SettingDefinition;
  const defaults = def.defaults as Record<string, unknown>;
  const raw = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  let merged: Record<string, unknown>;
  if (def.merge === "entries") {
    merged = { ...defaults };
    for (const [entry, value] of Object.entries(raw)) {
      const base = defaults[entry];
      merged[entry] = base && typeof base === "object" && value && typeof value === "object" ? { ...base, ...value } : value;
    }
  } else {
    merged = { ...defaults, ...raw };
  }
  const parsed = def.schema.safeParse(merged);
  return (parsed.success ? parsed.data : def.defaults) as SettingValue<K>;
}
