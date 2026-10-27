import { PERMISSIONS } from "@/lib/permissions";
import { assignmentCreateSchema, assignmentListQuerySchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { assignmentService } from "@/server/modules/configuration/role.service";

/** GET /api/configuration/assignments – q (person), roleId, scopeType, userId; 20 per page. */
export const GET = apiHandler({ permission: PERMISSIONS.ADMIN_ROLES, query: assignmentListQuerySchema }, async ({ query, user }) =>
  assignmentService.list(query, user),
);

/** POST /api/configuration/assignments – person + role + scope (an identical combination → 409). */
export const POST = apiHandler({ permission: PERMISSIONS.ADMIN_ROLES, body: assignmentCreateSchema }, async ({ body, user, meta }) =>
  assignmentService.create(body, user, meta),
);
