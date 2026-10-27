import { syncRequestSchema, type SyncResponse } from "@/lib/offline/operations";
import { apiHandler } from "@/server/http/api-handler";
import { syncService } from "@/server/modules/sync/sync.service";

/** POST /api/sync – replay operations queued in the offline outbox. */
export const POST = apiHandler({ body: syncRequestSchema }, async ({ body, user, meta }): Promise<SyncResponse> => {
  const results = await syncService.apply(body, user, meta);
  return { results };
});
