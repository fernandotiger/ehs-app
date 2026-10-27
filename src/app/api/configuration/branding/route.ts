import { PERMISSIONS } from "@/lib/permissions";
import { brandingUpdateSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { brandingService } from "@/server/modules/configuration/branding.service";

/** GET /api/configuration/branding – name, colours, logo details and version. */
export const GET = apiHandler({ permission: PERMISSIONS.CONFIG_BRANDING }, async ({ user }) => brandingService.get(user));

/** PUT /api/configuration/branding – { name, primary, secondary, tertiary, expectedVersion }. */
export const PUT = apiHandler({ permission: PERMISSIONS.CONFIG_BRANDING, body: brandingUpdateSchema }, async ({ body, user, meta }) =>
  brandingService.update(body, user, meta),
);
