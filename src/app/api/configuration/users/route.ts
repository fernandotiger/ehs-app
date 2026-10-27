import { PERMISSIONS } from "@/lib/permissions";
import { userCreateSchema, userListQuerySchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { userAdminService } from "@/server/modules/configuration/user-admin.service";

/** GET /api/configuration/users – paginated directory (q, departmentId, roleId, status). */
export const GET = apiHandler({ permission: PERMISSIONS.ADMIN_USERS, query: userListQuerySchema }, async ({ query, user }) => userAdminService.list(query, user));

/** POST /api/configuration/users – add a person with an initial scoped role (no invitation e-mail is sent). */
export const POST = apiHandler({ permission: PERMISSIONS.ADMIN_USERS, body: userCreateSchema }, async ({ body, user, meta }) =>
  userAdminService.create(body, user, meta),
);
