import { PERMISSIONS } from "@/lib/permissions";
import { legislationSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** POST /api/simplified-law/config/legislation – add your own law to a sub-category. */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: legislationSchema }, async ({ body, user, meta }) => slawConfigService.createLegislation(body, user, meta));
