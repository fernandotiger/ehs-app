import { z } from "zod";
import { apiHandler } from "@/server/http/api-handler";
import { brandingService, publicBrandingService } from "@/server/modules/configuration/branding.service";

/** GET /api/public/branding/:slug/logo – PUBLIC logo for the sign-in page. */
export const GET = apiHandler({ auth: false, query: z.object({ v: z.string().optional() }) }, async ({ params, query }) => {
  const org = await publicBrandingService.bySlug(params.slug ?? "");
  return brandingService.logoResponse(org.organizationId, query.v ?? null);
});
