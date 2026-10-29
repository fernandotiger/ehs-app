import { PERMISSIONS } from "@/lib/permissions";
import { jurisdictionSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawSettingsService } from "@/server/modules/simplified-law/settings.service";

/** POST /api/simplified-law/config/jurisdictions/remove – remove an unused jurisdiction. */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: jurisdictionSchema }, async ({ body, user, meta }) => slawSettingsService.removeJurisdiction(body.name, user, meta));
