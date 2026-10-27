import { PERMISSIONS } from "@/lib/permissions";
import { companySettingsSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { companyService } from "@/server/modules/configuration/branding.service";

/** GET /api/configuration/company – name, time zone, locale, plan and version. */
export const GET = apiHandler({ permission: PERMISSIONS.ADMIN_SETTINGS }, async ({ user }) => companyService.get(user));

/** PUT /api/configuration/company – { timeZone, locale, expectedVersion } (stored on Organization). */
export const PUT = apiHandler({ permission: PERMISSIONS.ADMIN_SETTINGS, body: companySettingsSchema }, async ({ body, user, meta }) =>
  companyService.update(body, user, meta),
);
