import { z } from "zod";
import { idSchema } from "./common";

/**
 * Evidence on any record: uploaded files (two-phase upload, purpose "evidence", 2 MB default)
 * and named external links. Shared by <EvidencePanel/> and /api/evidence.
 */

/** Record reference used by the polymorphic platform services (evidence, comments, links). */
export const entityRefSchema = z.object({
  entityType: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Za-z]{1,63}$/, "Unknown record type"),
  entityId: idSchema,
});
export type EntityRefInput = z.infer<typeof entityRefSchema>;

/** Only absolute http(s) URLs with a host are accepted (no javascript:, data:, mailto: …). */
export function isAllowedEvidenceUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (!url.hostname || url.username || url.password) return false;
  return /^[a-z0-9.-]+$/i.test(url.hostname) || /^\[[0-9a-f:.]+\]$/i.test(url.hostname);
}

export const evidenceLinkSchema = z.object({
  name: z.string().trim().min(1, "Describe what the link is").max(200),
  url: z
    .string()
    .trim()
    .min(1, "Enter the address")
    .max(2000)
    .refine(isAllowedEvidenceUrl, "Enter a valid address starting with http:// or https://"),
});
export type EvidenceLinkInput = z.infer<typeof evidenceLinkSchema>;

export const createEvidenceSchema = z.discriminatedUnion("kind", [
  entityRefSchema.extend({
    kind: z.literal("FILE"),
    uploadId: idSchema,
    /** Optional description; defaults to the file name. */
    name: z.string().trim().max(200).optional(),
  }),
  entityRefSchema.extend({ kind: z.literal("LINK"), ...evidenceLinkSchema.shape }),
]);
export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;

export interface EvidenceDto {
  id: string;
  kind: "FILE" | "LINK";
  name: string;
  /** External address (links only). */
  url: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Authorised download route (files only). */
  downloadUrl: string | null;
  /** Null for files added with an anonymous incident report. */
  uploadedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface EvidenceListDto {
  items: EvidenceDto[];
  /** The user may add and remove evidence on this record. */
  canEdit: boolean;
}

// ── Comments ────────────────────────────────────────────────────────────────

export const createCommentSchema = entityRefSchema.extend({
  body: z.string().trim().min(1, "Write a comment").max(5000),
  /** Client-generated UUID – makes offline replays idempotent. */
  clientId: z.string().uuid().optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export interface CommentDto {
  id: string;
  body: string;
  author: { id: string; name: string };
  createdAt: string;
  clientId: string | null;
}

// ── Record links ────────────────────────────────────────────────────────────

export interface LinkedRecordDto {
  id: string;
  kind: string;
  /** The record on the other side of the link. */
  entityType: string;
  entityId: string;
  label: string;
  href: string;
  createdAt: string;
}

export interface LinkedRecordsDto {
  /** Follow-ups raised from this record. */
  outgoing: LinkedRecordDto[];
  /** Records this one was raised from. */
  incoming: LinkedRecordDto[];
}
