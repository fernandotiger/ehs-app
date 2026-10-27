import { z } from "zod";

/**
 * Contract for operations that can be queued offline and replayed via POST /api/sync.
 * Shared by the client outbox and the server sync handlers.
 *
 * File references: a payload may contain `{ "$file": "<localFileId>" }` placeholders.
 * The sync engine uploads those files first and replaces each placeholder with the
 * resulting `uploadId` string before sending the operation.
 */

/** Modules add their operation types here and a handler in their sync-handlers.ts. */
export const SYNC_OPERATION_TYPES = ["document.acknowledge", "document.survey_answer", "comment.create", "incident.report"] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

export const syncRequestSchema = z.object({
  operations: z
    .array(
      z.object({
        id: z.string().uuid(),
        type: z.enum(SYNC_OPERATION_TYPES),
        payload: z.record(z.string(), z.unknown()),
        clientCreatedAt: z.string().datetime().optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export type SyncOperationResult =
  | { id: string; status: "applied" | "duplicate"; result?: unknown }
  | { id: string; status: "rejected"; error: { code: string; message: string } };

export interface SyncResponse {
  results: SyncOperationResult[];
}

export function isFilePlaceholder(value: unknown): value is { $file: string } {
  return typeof value === "object" && value !== null && typeof (value as { $file?: unknown }).$file === "string";
}
