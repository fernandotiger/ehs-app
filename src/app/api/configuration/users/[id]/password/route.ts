import { PERMISSIONS } from "@/lib/permissions";
import { passwordSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { userAdminService } from "@/server/modules/configuration/user-admin.service";

/** PUT /api/configuration/users/:id/password – set a temporary password (also enables sign-in). */
export const PUT = apiHandler({ permission: PERMISSIONS.ADMIN_USERS, body: passwordSchema }, async ({ params, body, user, meta }) =>
  userAdminService.setPassword(params.id!, body.password, user, meta),
);
