import { apiHandler } from "@/server/http/api-handler";
import { publicBrandingService } from "@/server/modules/configuration/branding.service";

/**
 * GET /api/public/branding/:slug – PUBLIC, read-only sign-in branding (company name, colours,
 * logo URL). Nothing else about the company is exposed.
 */
export const GET = apiHandler({ auth: false }, async ({ params }) => {
  const { name, colours, logoUrl } = await publicBrandingService.bySlug(params.slug ?? "");
  return { name, colours, logoUrl };
});
