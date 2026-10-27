import { lookupValueUpdateSchema } from "@/lib/lookups";
import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { categoryListService } from "@/server/modules/configuration/category-list.service";

/** PATCH /api/configuration/document-categories/:id – rename, notes, colour, (de)activate. */
export const PATCH = apiHandler(
  { module: "documents", permission: PERMISSIONS.CONFIG_LISTS, body: lookupValueUpdateSchema },
  async ({ params, body, user, meta }) => categoryListService.update(params.id!, body, user, meta),
);
