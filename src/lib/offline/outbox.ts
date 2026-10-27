"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { SyncOperationType } from "./operations";
import { offlineDb, type OutboxOperation } from "./db";

export interface EnqueueInput {
  type: SyncOperationType;
  payload: Record<string, unknown>;
  label: string;
  userId: string;
  /** Files referenced from the payload via `{ $file: id }` placeholders – see `stageFile`. */
  fileIds?: string[];
  /** Optional explicit id (e.g. to reuse a comment clientId). */
  id?: string;
}

/** Store a file locally and return a placeholder to embed in an operation payload. */
export async function stageFile(file: File | Blob, fileName?: string): Promise<{ $file: string }> {
  const id = crypto.randomUUID();
  await offlineDb().files.add({
    id,
    blob: file,
    fileName: fileName ?? (file instanceof File ? file.name : "file"),
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    createdAt: Date.now(),
  });
  return { $file: id };
}

export async function enqueue(input: EnqueueInput): Promise<OutboxOperation> {
  const op: OutboxOperation = {
    id: input.id ?? crypto.randomUUID(),
    type: input.type,
    payload: input.payload,
    label: input.label,
    fileIds: input.fileIds ?? [],
    status: "pending",
    attempts: 0,
    userId: input.userId,
    createdAt: Date.now(),
  };
  await offlineDb().outbox.put(op);
  return op;
}

export async function discardOperation(id: string) {
  const db = offlineDb();
  await db.transaction("rw", db.outbox, db.files, async () => {
    const op = await db.outbox.get(id);
    if (op?.fileIds.length) await db.files.bulkDelete(op.fileIds);
    await db.outbox.delete(id);
  });
}

export async function retryOperation(id: string) {
  await offlineDb().outbox.update(id, { status: "pending", error: undefined });
}

/** Live list of queued operations for the signed-in user. */
export function useOutbox(userId: string | undefined, type?: SyncOperationType): OutboxOperation[] {
  return (
    useLiveQuery(async () => {
      if (!userId || typeof window === "undefined") return [];
      const ops = await offlineDb().outbox.where("userId").equals(userId).sortBy("createdAt");
      return type ? ops.filter((o) => o.type === type) : ops;
    }, [userId, type]) ?? []
  );
}
