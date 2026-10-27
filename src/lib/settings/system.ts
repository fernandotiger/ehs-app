import { z } from "zod";

/** Company-wide system settings (Configuration → System settings). */
export const systemSettingsSchema = z.object({
  /** Limit for document versions and other large uploads. */
  maxUploadSizeMb: z.coerce.number().int().min(1).max(500),
  /** Limit for evidence attached to records (files on incidents, audits, inspections …). */
  evidenceMaxUploadMb: z.coerce.number().int().min(1).max(50),
  defaultAckDueDays: z.coerce.number().int().min(1).max(365),
  defaultReminderIntervalDays: z.coerce.number().int().min(1).max(90),
  defaultEscalationDays: z.coerce.number().int().min(0).max(365),
  actionReminderDaysBeforeDue: z.coerce.number().int().min(0).max(60),
});

export type SystemSettings = z.infer<typeof systemSettingsSchema>;

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  maxUploadSizeMb: 10,
  evidenceMaxUploadMb: 2,
  defaultAckDueDays: 14,
  defaultReminderIntervalDays: 3,
  defaultEscalationDays: 7,
  actionReminderDaysBeforeDue: 2,
};
