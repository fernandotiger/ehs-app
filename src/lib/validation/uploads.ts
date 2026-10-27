import { z } from "zod";

/**
 * Why a file is uploaded. Decides the size limit (System settings) and the storage folder.
 * Modules with their own large-file needs add a purpose here; record evidence uses "evidence".
 */
export const UPLOAD_PURPOSES = ["document-version", "evidence", "branding-logo"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

/** Storage folder per purpose (below `org/<organizationId>/`). */
export const UPLOAD_FOLDERS: Record<UploadPurpose, string> = {
  "document-version": "documents",
  evidence: "evidence",
  "branding-logo": "branding",
};

/** Fixed limits that do not come from System settings (bytes). */
export const FIXED_UPLOAD_LIMITS: Partial<Record<UploadPurpose, number>> = {
  "branding-logo": 2 * 1024 * 1024,
};

export const initUploadSchema = z.object({
  purpose: z.enum(UPLOAD_PURPOSES),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(255).default("application/octet-stream"),
  sizeBytes: z.number().int().nonnegative(),
});
export type InitUploadInput = z.infer<typeof initUploadSchema>;
