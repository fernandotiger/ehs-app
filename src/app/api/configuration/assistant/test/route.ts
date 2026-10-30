import { PERMISSIONS } from "@/lib/permissions";
import { assistantTestSchema } from "@/lib/validation/assistant";
import { apiHandler } from "@/server/http/api-handler";
import { assistantService } from "@/server/modules/assistant/assistant.service";
import { requireCompanyConfig } from "@/server/modules/configuration/config-access";

export const maxDuration = 120;

/** POST /api/configuration/assistant/test – { question, config } → NDJSON stream, using the unsaved settings on screen. */
export const POST = apiHandler({ permission: PERMISSIONS.ADMIN_SETTINGS, body: assistantTestSchema }, async ({ body, user, req }) => {
  requireCompanyConfig(user, PERMISSIONS.ADMIN_SETTINGS);
  return assistantService.test(user, body, req.signal);
});
