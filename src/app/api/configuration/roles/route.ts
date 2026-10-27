import { z } from "zod";
import { PERMISSIONS } from "@/lib/permissions";
import { roleCreateSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { roleService } from "@/server/modules/configuration/role.service";

const query = z.object({ q: z.string().trim().max(100).optional() });

/** GET /api/configuration/roles – roles with permissions and assignment counts. */
export const GET = apiHandler({ permission: PERMISSIONS.ADMIN_ROLES, query }, async ({ query, user }) => roleService.list(query.q, user));

/** POST /api/configuration/roles – a named EMPTY role (case-insensitive duplicates rejected). */
export const POST = apiHandler({ permission: PERMISSIONS.ADMIN_ROLES, body: roleCreateSchema }, async ({ body, user, meta }) =>
  roleService.create({ name: body.name, description: body.description }, user, meta),
);
