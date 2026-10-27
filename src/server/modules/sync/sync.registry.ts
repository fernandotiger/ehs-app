import "server-only";
import { commentSyncHandlers } from "@/server/modules/comments/sync-handlers";
import { documentSyncHandlers } from "@/server/modules/documents/sync-handlers";
import { incidentSyncHandlers } from "@/server/modules/incidents/sync-handlers";
import type { SyncHandlerMap } from "./sync.types";

/**
 * Registry of offline-sync handlers contributed by each module.
 * Modules export a `SyncHandlerMap`; add it to the spread below.
 */
export const syncHandlers: SyncHandlerMap = {
  ...documentSyncHandlers,
  ...commentSyncHandlers,
  ...incidentSyncHandlers,
};
