import { PERMISSIONS } from "@/lib/permissions";
import { userUpdateSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { userAdminService } from "@/server/modules/configuration/user-admin.service";

/** GET /api/configuration/users/:id – person with assignments. */
export const GET = apiHandler({ permission: PERMISSIONS.ADMIN_USERS }, async ({ params, user }) => userAdminService.get(params.id!, user));

/** PATCH /api/configuration/users/:id – name, email, job title, department, manager. */
export const PATCH = apiHandler({ permission: PERMISSIONS.ADMIN_USERS, body: userUpdateSchema }, async ({ params, body, user, meta }) =>
  userAdminService.update(params.id!, body, user, meta),
);
