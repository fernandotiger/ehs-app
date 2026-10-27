import { PERMISSIONS } from "@/lib/permissions";
import { activeSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { userAdminService } from "@/server/modules/configuration/user-admin.service";

/** PUT /api/configuration/users/:id/active – { isActive }; deactivating revokes the person's sessions. */
export const PUT = apiHandler({ permission: PERMISSIONS.ADMIN_USERS, body: activeSchema }, async ({ params, body, user, meta }) =>
  userAdminService.setActive(params.id!, body.isActive, user, meta),
);
