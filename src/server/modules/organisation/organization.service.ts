import "server-only";
import { logoUrl, parseBranding, parseStoredLogo, type BrandingColours, type BrandingDto } from "@/lib/branding";
import { systemPrisma } from "@/server/db/client";

/** The tenant record itself (Organization is not tenant-scoped; always pass the caller's id). */
export const organizationService = {
  async branding(organizationId: string): Promise<BrandingColours> {
    const org = await systemPrisma.organization.findUnique({ where: { id: organizationId }, select: { branding: true } });
    return parseBranding(org?.branding);
  },

  /** Name, colours and logo URL for the app shell (any signed-in user of the tenant). */
  async shellBranding(organizationId: string): Promise<BrandingDto> {
    const org = await systemPrisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, branding: true } });
    return { name: org?.name ?? "", colours: parseBranding(org?.branding), logoUrl: logoUrl(parseStoredLogo(org?.branding)) };
  },
};
