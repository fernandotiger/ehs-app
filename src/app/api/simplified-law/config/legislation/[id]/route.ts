import { PERMISSIONS } from "@/lib/permissions";
import { legislationUpdateSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** PUT /api/simplified-law/config/legislation/:id – details of a law (expectedVersion). */
export const PUT = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: legislationUpdateSchema }, async ({ params, body, user, meta }) => slawConfigService.updateLegislation(params.id!, body, user, meta));
