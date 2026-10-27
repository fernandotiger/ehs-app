import { lookupValueUpdateSchema } from "@/lib/lookups";
import { apiHandler } from "@/server/http/api-handler";
import { listKeyOf, requireListManager } from "@/server/modules/lookups/lookup-params";
import { lookupService } from "@/server/modules/lookups/lookup.service";

/** PATCH /api/configuration/lookups/:listKey/:id – rename, notes, colour, (de)activate. */
export const PATCH = apiHandler({ body: lookupValueUpdateSchema }, async ({ params, body, user, meta }) =>
  lookupService.update(requireListManager(user, listKeyOf(params)), params.id!, body, user, meta),
);

/** DELETE /api/configuration/lookups/:listKey/:id – deactivates (values are never hard-deleted). */
export const DELETE = apiHandler({}, async ({ params, user, meta }) =>
  lookupService.deactivate(requireListManager(user, listKeyOf(params)), params.id!, user, meta),
);
