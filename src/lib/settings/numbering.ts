import { z } from "zod";
import type { ModuleKey } from "../modules";

/**
 * Reference-number formats per record type (Configuration → Lists & numbering).
 * Counters are per tenant and – when the year is included – per year, e.g. INC-2026-0001.
 * Modules add their record type here and call `numberingService.next(tx, "<key>")`.
 */
export interface NumberingTypeDescriptor {
  label: string;
  module: ModuleKey;
  prefix: string;
}

export const NUMBERING_TYPES = {
  incident: { label: "Incidents", module: "incidents", prefix: "INC" },
  "corrective-action": { label: "Corrective & preventive actions", module: "incidents", prefix: "ACT" },
  "risk-assessment": { label: "Risk assessments", module: "risk", prefix: "RA" },
  "risk-task": { label: "Risk tasks", module: "risk", prefix: "RT" },
  action: { label: "Actions", module: "actions", prefix: "AC" },
  audit: { label: "Audits", module: "audits", prefix: "AUD" },
  "audit-finding": { label: "Audit findings", module: "audits", prefix: "FND" },
  inspection: { label: "Inspections", module: "inspections", prefix: "INS" },
  "legal-evaluation": { label: "Compliance evaluations", module: "law", prefix: "LEV" },
} as const satisfies Record<string, NumberingTypeDescriptor>;

export type NumberingKey = keyof typeof NUMBERING_TYPES;

export const NUMBERING_KEYS = Object.keys(NUMBERING_TYPES) as NumberingKey[];

export const numberFormatSchema = z.object({
  prefix: z
    .string()
    .trim()
    .min(1, "Enter a prefix")
    .max(10)
    .regex(/^[A-Za-z0-9]+$/, "Letters and numbers only"),
  includeYear: z.boolean(),
  padding: z.coerce.number().int().min(1).max(8),
});
export type NumberFormat = z.infer<typeof numberFormatSchema>;

export const numberingSettingsSchema = z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), numberFormatSchema);
export type NumberingSettings = z.infer<typeof numberingSettingsSchema>;

export function defaultNumberFormat(key: string): NumberFormat {
  const type = (NUMBERING_TYPES as Record<string, NumberingTypeDescriptor>)[key];
  const prefix = type?.prefix ?? key.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
  return { prefix: prefix || "REF", includeYear: true, padding: 4 };
}

export const DEFAULT_NUMBERING_SETTINGS: NumberingSettings = Object.fromEntries(
  NUMBERING_KEYS.map((key) => [key, defaultNumberFormat(key)]),
);

/** "INC-2026-0001" (with year) or "INC-0001" (without). */
export function formatReference(format: NumberFormat, year: number, value: number): string {
  const number = String(value).padStart(format.padding, "0");
  return format.includeYear ? `${format.prefix}-${year}-${number}` : `${format.prefix}-${number}`;
}

/** Counter row key: per year when the year is part of the reference, so numbering restarts each year. */
export function counterKey(key: string, format: NumberFormat, year: number): string {
  return format.includeYear ? `${key}:${year}` : key;
}
