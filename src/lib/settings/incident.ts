import { z } from "zod";
import { DEFAULT_EXPORT_COLUMNS } from "../incidents";

/**
 * Incident module settings (Configuration → Incident settings): the ordered column selection for
 * incident CSV exports. Standard column keys come from STANDARD_EXPORT_COLUMNS; custom answers are
 * "answer:<questionKey>" (only questions marked exportable are written).
 */
export const incidentSettingsSchema = z.object({
  exportColumns: z
    .array(z.string().trim().min(1).max(120))
    .min(1, "Choose at least one export column")
    .max(80)
    .refine((cols) => new Set(cols).size === cols.length, "Each column can only be chosen once"),
});
export type IncidentSettings = z.infer<typeof incidentSettingsSchema>;

export const DEFAULT_INCIDENT_SETTINGS: IncidentSettings = { exportColumns: DEFAULT_EXPORT_COLUMNS };
