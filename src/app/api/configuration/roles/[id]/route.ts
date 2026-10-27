import { PERMISSIONS } from "@/lib/permissions";
import { roleUpdateSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { roleService } from "@/server/modules/configuration/role.service";

/** GET /api/configuration/roles/:id */
export const GET = apiHandler({ permission: PERMISSIONS.ADMIN_ROLES }, async ({ params, user }) => roleService.get(params.id!, user));

/** PATCH /api/configuration/roles/:id – { name?, description?, permissions?, expectedVersion } (409 STALE_VERSION on conflict). */
export const PATCH = apiHandler({ permission: PERMISSIONS.ADMIN_ROLES, body: roleUpdateSchema }, async ({ params, body, user, meta }) =>
  roleService.update(params.id!, body, user, meta),
);

/** DELETE /api/configuration/roles/:id – only non-system roles without assignments. */
export const DELETE = apiHandler({ permission: PERMISSIONS.ADMIN_ROLES }, async ({ params, user, meta }) => roleService.delete(params.id!, user, meta));
