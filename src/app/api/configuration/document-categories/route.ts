import { lookupValueSchema } from "@/lib/lookups";
import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { categoryListService } from "@/server/modules/configuration/category-list.service";

/** GET /api/configuration/document-categories – all categories (incl. inactive) for Configuration → Lists. */
export const GET = apiHandler({ module: "documents", permission: PERMISSIONS.CONFIG_LISTS }, async ({ user }) => categoryListService.values(user));

/** POST /api/configuration/document-categories */
export const POST = apiHandler({ module: "documents", permission: PERMISSIONS.CONFIG_LISTS, body: lookupValueSchema }, async ({ body, user, meta }) =>
  categoryListService.create(body, user, meta),
);
