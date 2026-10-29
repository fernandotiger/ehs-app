import { PERMISSIONS } from "@/lib/permissions";
import { requirementSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** POST /api/simplified-law/config/legislation/:id/requirements – add a requirement (it goes last). */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: requirementSchema }, async ({ params, body, user, meta }) => slawConfigService.addRequirement(params.id!, body, user, meta));
