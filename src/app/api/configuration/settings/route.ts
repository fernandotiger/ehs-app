import { PERMISSIONS } from "@/lib/permissions";
import { systemSettingsSchema } from "@/lib/settings/system";
import { apiHandler } from "@/server/http/api-handler";
import { settingsService } from "@/server/modules/settings/settings.service";

/** GET /api/configuration/settings – system settings; any signed-in user may read (e.g. upload limits). */
export const GET = apiHandler({}, async () => settingsService.get("system"));

/** PUT /api/configuration/settings */
export const PUT = apiHandler(
  { permission: PERMISSIONS.ADMIN_SETTINGS, body: systemSettingsSchema },
  async ({ body, user, meta }) => settingsService.update("system", body, user, meta),
);
