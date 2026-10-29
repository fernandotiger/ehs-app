import { PERMISSIONS } from "@/lib/permissions";
import { jurisdictionSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawSettingsService } from "@/server/modules/simplified-law/settings.service";

/** POST /api/simplified-law/config/jurisdictions – add a jurisdiction to the list (it goes last). */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: jurisdictionSchema }, async ({ body, user, meta }) => slawSettingsService.addJurisdiction(body.name, user, meta));
