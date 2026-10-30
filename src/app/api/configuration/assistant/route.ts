import { PERMISSIONS } from "@/lib/permissions";
import { assistantConfigUpdateSchema } from "@/lib/validation/assistant";
import { apiHandler } from "@/server/http/api-handler";
import { assistantService } from "@/server/modules/assistant/assistant.service";
import { requireCompanyConfig } from "@/server/modules/configuration/config-access";

/** GET /api/configuration/assistant – settings + version, whether the key is set, the built-in guide. */
export const GET = apiHandler({ permission: PERMISSIONS.ADMIN_SETTINGS }, async ({ user }) => {
  requireCompanyConfig(user, PERMISSIONS.ADMIN_SETTINGS);
  return assistantService.getForEditing();
});

/** PUT /api/configuration/assistant – { value, expectedVersion } → 409 STALE_VERSION when someone saved first. */
export const PUT = apiHandler({ permission: PERMISSIONS.ADMIN_SETTINGS, body: assistantConfigUpdateSchema }, async ({ body, user, meta }) => {
  requireCompanyConfig(user, PERMISSIONS.ADMIN_SETTINGS);
  return assistantService.update(body.value, body.expectedVersion, user, meta);
});
