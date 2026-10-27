"use client";

import { api, ApiError } from "@/lib/api-client";
import { uploadFile } from "@/lib/upload-client";
import type { UploadPurpose } from "@/lib/validation/uploads";
import { offlineDb, type OutboxOperation } from "./db";
import { isFilePlaceholder, type SyncResponse } from "./operations";

export interface SyncSummary {
  applied: number;
  rejected: number;
  remaining: number;
  offline: boolean;
}

/** Upload purpose for files staged by an operation type (default: record evidence). */
const UPLOAD_PURPOSE_BY_TYPE: Partial<Record<string, UploadPurpose>> = {};

let running: Promise<SyncSummary> | null = null;

/** Replace `{ $file }` placeholders with upload ids, uploading each local file. */
async function resolveFiles(op: OutboxOperation): Promise<Record<string, unknown>> {
  const db = offlineDb();
  const purpose = UPLOAD_PURPOSE_BY_TYPE[op.type] ?? "evidence";

  const walk = async (value: unknown): Promise<unknown> => {
    if (isFilePlaceholder(value)) {
      const file = await db.files.get(value.$file);
      if (!file) throw new ApiError("A queued attachment is missing from this device", 422, "FILE_MISSING");
      const { uploadId } = await uploadFile(file.blob, purpose, { fileName: file.fileName });
      return uploadId;
    }
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = await walk(v);
      return out;
    }
    return value;
  };

  return (await walk(op.payload)) as Record<string, unknown>;
}

async function runSync(userId: string): Promise<SyncSummary> {
  const db = offlineDb();
  const ops = (await db.outbox.where("userId").equals(userId).sortBy("createdAt")).filter((o) => o.status !== "failed");
  let applied = 0;
  let rejected = 0;

  for (const op of ops) {
    await db.outbox.update(op.id, { status: "syncing", attempts: op.attempts + 1 });
    try {
      const payload = await resolveFiles(op);
      const { results } = await api.post<SyncResponse>("/api/sync", {
        operations: [{ id: op.id, type: op.type, payload, clientCreatedAt: new Date(op.createdAt).toISOString() }],
      });
      const result = results[0];
      if (result && result.status === "rejected") {
        rejected++;
        await db.outbox.update(op.id, { status: "failed", error: result.error.message });
      } else {
        applied++;
        await db.transaction("rw", db.outbox, db.files, async () => {
          if (op.fileIds.length) await db.files.bulkDelete(op.fileIds);
          await db.outbox.delete(op.id);
        });
      }
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkError) {
        await db.outbox.update(op.id, { status: "pending" });
        const remaining = await db.outbox.where("userId").equals(userId).count();
        return { applied, rejected, remaining, offline: true };
      }
      rejected++;
      await db.outbox.update(op.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Sync failed",
      });
    }
  }

  const remaining = await db.outbox.where("userId").equals(userId).count();
  return { applied, rejected, remaining, offline: false };
}

/** Replays the outbox. Concurrent calls share the same run. */
export function syncNow(userId: string): Promise<SyncSummary> {
  running ??= runSync(userId).finally(() => {
    running = null;
  });
  return running;
}
