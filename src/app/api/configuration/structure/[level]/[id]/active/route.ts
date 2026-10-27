import { PERMISSIONS } from "@/lib/permissions";
import { activeSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { levelOf } from "@/server/modules/configuration/config-access";
import { structureService } from "@/server/modules/configuration/structure.service";

/** PUT /api/configuration/structure/:level/:id/active – { isActive } (deactivate instead of delete). */
export const PUT = apiHandler({ permission: PERMISSIONS.ADMIN_ORGANISATION, body: activeSchema }, async ({ params, body, user, meta }) =>
  structureService.setActive(levelOf(params), params.id!, body.isActive, user, meta),
);
