import { lookupReorderSchema } from "@/lib/lookups";
import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { categoryListService } from "@/server/modules/configuration/category-list.service";

/** POST /api/configuration/document-categories/reorder – { ids } in the new order. */
export const POST = apiHandler({ module: "documents", permission: PERMISSIONS.CONFIG_LISTS, body: lookupReorderSchema }, async ({ body, user, meta }) =>
  categoryListService.reorder(body.ids, user, meta),
);
