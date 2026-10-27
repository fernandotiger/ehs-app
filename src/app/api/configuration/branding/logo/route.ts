import { z } from "zod";
import { PERMISSIONS } from "@/lib/permissions";
import { logoUploadSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { brandingService } from "@/server/modules/configuration/branding.service";

/** GET /api/configuration/branding/logo?v=… – the caller's company logo (any signed-in user of the company). */
export const GET = apiHandler({ query: z.object({ v: z.string().optional() }) }, async ({ user, query }) =>
  brandingService.logoResponse(user.organizationId, query.v ?? null),
);

/** POST /api/configuration/branding/logo – { uploadId } from uploadFile(file, "branding-logo"). */
export const POST = apiHandler({ permission: PERMISSIONS.CONFIG_BRANDING, body: logoUploadSchema }, async ({ body, user, meta }) =>
  brandingService.setLogo(body.uploadId, user, meta),
);

/** DELETE /api/configuration/branding/logo – back to the default mark. */
export const DELETE = apiHandler({ permission: PERMISSIONS.CONFIG_BRANDING }, async ({ user, meta }) => brandingService.removeLogo(user, meta));
