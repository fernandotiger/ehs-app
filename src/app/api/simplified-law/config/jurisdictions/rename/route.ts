import { PERMISSIONS } from "@/lib/permissions";
import { jurisdictionRenameSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawSettingsService } from "@/server/modules/simplified-law/settings.service";

/** POST /api/simplified-law/config/jurisdictions/rename – rename it in the list and on every law that uses it. */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: jurisdictionRenameSchema }, async ({ body, user, meta }) => slawSettingsService.renameJurisdiction(body.from, body.to, user, meta));
