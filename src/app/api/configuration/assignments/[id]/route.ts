import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { assignmentService } from "@/server/modules/configuration/role.service";

/** DELETE /api/configuration/assignments/:id – the protected owner assignment cannot be removed. */
export const DELETE = apiHandler({ permission: PERMISSIONS.ADMIN_ROLES }, async ({ params, user, meta }) => assignmentService.remove(params.id!, user, meta));
