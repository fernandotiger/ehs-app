import { PERMISSIONS } from "@/lib/permissions";
import { structureNodeSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { levelOf } from "@/server/modules/configuration/config-access";
import { structureService } from "@/server/modules/configuration/structure.service";

/** PATCH /api/configuration/structure/:level/:id – rename, code, notes or move under another parent. */
export const PATCH = apiHandler({ permission: PERMISSIONS.ADMIN_ORGANISATION, body: structureNodeSchema }, async ({ params, body, user, meta }) =>
  structureService.update(levelOf(params), params.id!, body, user, meta),
);
