import { lookupReorderSchema } from "@/lib/lookups";
import { apiHandler } from "@/server/http/api-handler";
import { listKeyOf, requireListManager } from "@/server/modules/lookups/lookup-params";
import { lookupService } from "@/server/modules/lookups/lookup.service";

/** POST /api/configuration/lookups/:listKey/reorder – { ids } in the new order. */
export const POST = apiHandler({ body: lookupReorderSchema }, async ({ params, body, user, meta }) =>
  lookupService.reorder(requireListManager(user, listKeyOf(params)), body.ids, user, meta),
);
