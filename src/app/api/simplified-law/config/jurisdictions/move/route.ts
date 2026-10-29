import { PERMISSIONS } from "@/lib/permissions";
import { jurisdictionMoveSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawSettingsService } from "@/server/modules/simplified-law/settings.service";

/** POST /api/simplified-law/config/jurisdictions/move – one place up or down in the list. */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: jurisdictionMoveSchema }, async ({ body, user, meta }) => slawSettingsService.moveJurisdiction(body.name, body.direction, user, meta));
