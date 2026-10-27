import { z } from "zod";
import { lookupValueSchema } from "@/lib/lookups";
import { hasAnyPermission } from "@/server/auth/authorization";
import { apiHandler } from "@/server/http/api-handler";
import { listKeyOf, listManagePermissions, requireListManager } from "@/server/modules/lookups/lookup-params";
import { lookupService } from "@/server/modules/lookups/lookup.service";

const query = z.object({ includeInactive: z.enum(["true", "false"]).optional() });

/** GET /api/configuration/lookups/:listKey – active values (inactive too for list managers). */
export const GET = apiHandler({ query }, async ({ params, query, user }) => {
  const listKey = listKeyOf(params);
  return lookupService.values(listKey, { includeInactive: query.includeInactive === "true" && hasAnyPermission(user, listManagePermissions(listKey)) });
});

/** POST /api/configuration/lookups/:listKey – add a value (case-insensitive duplicates rejected). */
export const POST = apiHandler({ body: lookupValueSchema }, async ({ params, body, user, meta }) =>
  lookupService.create(requireListManager(user, listKeyOf(params)), body, user, meta),
);
