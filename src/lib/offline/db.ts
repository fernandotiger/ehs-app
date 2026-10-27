"use client";

import Dexie, { type EntityTable } from "dexie";

export type OutboxStatus = "pending" | "syncing" | "failed";

/**
 * A mutation captured while offline (or deliberately queued) that will be replayed
 * against /api/sync when the user presses "Sync".
 */
export interface OutboxOperation {
  /** Client-generated UUID – doubles as the server-side idempotency key. */
  id: string;
  /** Operation type, e.g. "document.acknowledge" – see src/lib/offline/operations.ts */
  type: string;
  payload: Record<string, unknown>;
  /** Human readable description shown in the sync panel. */
  label: string;
  /** Local file ids (in the `files` table) to upload before replaying. */
  fileIds: string[];
  status: OutboxStatus;
  error?: string;
  attempts: number;
  userId: string;
  createdAt: number;
}

export interface OfflineFile {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
}

class OfflineDatabase extends Dexie {
  outbox!: EntityTable<OutboxOperation, "id">;
  files!: EntityTable<OfflineFile, "id">;

  constructor() {
    super("ehs-offline");
    this.version(1).stores({
      outbox: "id, type, status, userId, createdAt",
      files: "id, createdAt",
    });
  }
}

let instance: OfflineDatabase | null = null;

export function offlineDb(): OfflineDatabase {
  if (typeof window === "undefined") throw new Error("offlineDb is only available in the browser");
  instance ??= new OfflineDatabase();
  return instance;
}
