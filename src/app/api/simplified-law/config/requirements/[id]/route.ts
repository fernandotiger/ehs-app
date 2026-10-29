import { PERMISSIONS } from "@/lib/permissions";
import { requirementSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** PUT /api/simplified-law/config/requirements/:id – change a requirement. */
export const PUT = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: requirementSchema }, async ({ params, body, user, meta }) => slawConfigService.updateRequirement(params.id!, body, user, meta));

/** DELETE /api/simplified-law/config/requirements/:id – remove a requirement (audited). */
export const DELETE = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE }, async ({ params, user, meta }) => slawConfigService.removeRequirement(params.id!, user, meta));
