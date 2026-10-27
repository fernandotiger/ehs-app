import "server-only";
import { logoUrl, parseBranding, parseStoredLogo, type BrandingDto, type StoredLogo } from "@/lib/branding";
import { PERMISSIONS } from "@/lib/permissions";
import { LOGO_MAX_BYTES } from "@/lib/validation/configuration";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, systemPrisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { uploadService } from "@/server/modules/uploads/upload.service";
import { getStorage } from "@/server/storage";
import { cleanName, requireCompanyConfig } from "./config-access";
import { inspectLogo } from "./logo-image";

/**
 * Company branding and company-level settings stored on Organization (name, colours, logo,
 * time zone, locale). Organization is the tenant row itself (not tenant-scoped), so every query
 * passes the caller's organizationId explicitly. Colour/name/time-zone edits use the
 * Organization.version for optimistic concurrency; branding JSON is merged in SQL (jsonb ||) so a
 * logo change and a colour change never overwrite each other.
 */

export interface BrandingSettingsDto extends BrandingDto {
  version: number;
  logo: { fileName: string; mimeType: string; sizeBytes: number; updatedAt: string } | null;
}

export interface CompanySettingsDto {
  name: string;
  slug: string;
  timeZone: string;
  locale: string;
  plan: string;
  version: number;
}

async function loadOrg(organizationId: string) {
  const org = await systemPrisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new NotFoundError();
  return org;
}

async function readAll(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ValidationError("The logo is larger than 2 MB.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export const brandingService = {
  async get(actor: CurrentUser): Promise<BrandingSettingsDto> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_BRANDING);
    const org = await loadOrg(actor.organizationId);
    const logo = parseStoredLogo(org.branding);
    return {
      name: org.name,
      colours: parseBranding(org.branding),
      logoUrl: logoUrl(logo),
      version: org.version,
      logo: logo && { fileName: logo.fileName, mimeType: logo.mimeType, sizeBytes: logo.sizeBytes, updatedAt: logo.updatedAt },
    };
  },

  /** Company name + three colours (validated hex) – applied for everyone on their next page load. */
  async update(
    input: { name: string; primary: string; secondary: string; tertiary: string; expectedVersion: number },
    actor: CurrentUser,
    meta: RequestMeta,
  ): Promise<BrandingSettingsDto> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_BRANDING);
    const before = await loadOrg(actor.organizationId);
    const colours = { primary: input.primary.toLowerCase(), secondary: input.secondary.toLowerCase(), tertiary: input.tertiary.toLowerCase() };
    const name = cleanName(input.name);
    await prisma.$transaction(async (tx) => {
      const count = await tx.$executeRaw`
        UPDATE organizations
           SET branding = COALESCE(branding, '{}'::jsonb) || ${JSON.stringify(colours)}::jsonb,
               name = ${name}, version = version + 1, "updatedAt" = now()
         WHERE id = ${actor.organizationId} AND version = ${input.expectedVersion}`;
      if (count === 0) throw new StaleVersionError("Branding was changed by someone else – reload to see their changes.");
      const old = parseBranding(before.branding);
      await recordAudit(
        {
          entityType: "Organization",
          entityId: actor.organizationId,
          action: "BRANDING_UPDATED",
          actor,
          changes: {
            ...(before.name !== name ? { name: { from: before.name, to: name } } : {}),
            ...Object.fromEntries(
              (["primary", "secondary", "tertiary"] as const).filter((k) => old[k] !== colours[k]).map((k) => [k, { from: old[k] ?? null, to: colours[k] }]),
            ),
          },
          meta,
        },
        tx,
      );
    });
    return this.get(actor);
  },

  /**
   * Replaces the logo with an uploaded file (purpose "branding-logo"). The bytes are checked
   * (PNG/JPG/SVG, readable, ≤ 2 MB); on any failure the previous logo stays in place.
   */
  async setLogo(uploadId: string, actor: CurrentUser, meta: RequestMeta): Promise<BrandingSettingsDto> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_BRANDING);
    const previous = parseStoredLogo((await loadOrg(actor.organizationId)).branding);
    let rejectedKey: { driver: string; key: string } | null = null;
    try {
      await prisma.$transaction(
        async (tx) => {
          const file = await uploadService.consume(uploadId, actor, "branding-logo", tx);
          const object = await getStorage(file.storageDriver).get(file.storageKey);
          if (!object) throw new ValidationError("The upload did not arrive. Try again.");
          const bytes = await readAll(object.body, LOGO_MAX_BYTES).catch((error) => {
            rejectedKey = { driver: file.storageDriver, key: file.storageKey };
            throw error;
          });
          const check = inspectLogo(bytes, LOGO_MAX_BYTES);
          if (!check.ok) {
            rejectedKey = { driver: file.storageDriver, key: file.storageKey };
            throw new ValidationError(check.error);
          }
          const logo: StoredLogo = {
            storageDriver: file.storageDriver,
            storageKey: file.storageKey,
            mimeType: check.mimeType,
            fileName: file.fileName,
            sizeBytes: bytes.byteLength,
            updatedAt: new Date().toISOString(),
          };
          await tx.$executeRaw`
            UPDATE organizations
               SET branding = COALESCE(branding, '{}'::jsonb) || jsonb_build_object('logo', ${JSON.stringify(logo)}::jsonb), "updatedAt" = now()
             WHERE id = ${actor.organizationId}`;
          await recordAudit(
            {
              entityType: "Organization",
              entityId: actor.organizationId,
              action: "LOGO_UPDATED",
              actor,
              changes: { logo: { from: previous?.fileName ?? null, to: file.fileName } },
              metadata: { mimeType: check.mimeType, sizeBytes: bytes.byteLength, width: check.width, height: check.height },
              meta,
            },
            tx,
          );
        },
        { timeout: 30_000 },
      );
    } catch (error) {
      const rejected = rejectedKey as { driver: string; key: string } | null;
      if (rejected) await getStorage(rejected.driver).delete(rejected.key).catch(() => undefined);
      throw error;
    }
    // The replaced file is no longer referenced anywhere.
    if (previous) await getStorage(previous.storageDriver).delete(previous.storageKey).catch(() => undefined);
    return this.get(actor);
  },

  /** Back to the default OleoQ mark. */
  async removeLogo(actor: CurrentUser, meta: RequestMeta): Promise<BrandingSettingsDto> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_BRANDING);
    const previous = parseStoredLogo((await loadOrg(actor.organizationId)).branding);
    if (previous) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE organizations SET branding = branding - 'logo', "updatedAt" = now() WHERE id = ${actor.organizationId}`;
        await recordAudit({ entityType: "Organization", entityId: actor.organizationId, action: "LOGO_REMOVED", actor, changes: { logo: { from: previous.fileName, to: null } }, meta }, tx);
      });
      await getStorage(previous.storageDriver).delete(previous.storageKey).catch(() => undefined);
    }
    return this.get(actor);
  },

  /** Streams the tenant's logo (authorised: the organisation comes from the caller or a public slug lookup). */
  async logoResponse(organizationId: string, requestedVersion: string | null): Promise<Response> {
    const org = await systemPrisma.organization.findUnique({ where: { id: organizationId }, select: { branding: true } });
    const logo = parseStoredLogo(org?.branding);
    if (!logo) throw new NotFoundError("No logo");
    const object = await getStorage(logo.storageDriver).get(logo.storageKey);
    if (!object) throw new NotFoundError("No logo");
    const headers = new Headers({
      "Content-Type": logo.mimeType,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      // SVGs are inert when shown through <img>; this also neuters them if opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      "Cache-Control": requestedVersion === logo.updatedAt ? "private, max-age=31536000, immutable" : "private, no-cache",
    });
    if (object.sizeBytes) headers.set("Content-Length", String(object.sizeBytes));
    return new Response(object.body, { status: 200, headers });
  },
};

export const companyService = {
  async get(actor: CurrentUser): Promise<CompanySettingsDto> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_SETTINGS);
    const org = await loadOrg(actor.organizationId);
    return { name: org.name, slug: org.slug, timeZone: org.timeZone, locale: org.locale, plan: org.plan, version: org.version };
  },

  async update(input: { timeZone: string; locale: string; expectedVersion: number }, actor: CurrentUser, meta: RequestMeta): Promise<CompanySettingsDto> {
    requireCompanyConfig(actor, PERMISSIONS.ADMIN_SETTINGS);
    const before = await loadOrg(actor.organizationId);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.organization.updateMany({
        where: { id: actor.organizationId, version: input.expectedVersion },
        data: { timeZone: input.timeZone, locale: input.locale, version: { increment: 1 } },
      });
      if (updated.count === 0) throw new StaleVersionError("Company settings were changed by someone else – reload to see their changes.");
      const changes: Record<string, unknown> = {};
      if (before.timeZone !== input.timeZone) changes.timeZone = { from: before.timeZone, to: input.timeZone };
      if (before.locale !== input.locale) changes.locale = { from: before.locale, to: input.locale };
      if (Object.keys(changes).length) {
        await recordAudit({ entityType: "Organization", entityId: actor.organizationId, action: "SETTINGS_UPDATED", actor, changes, meta }, tx);
      }
    });
    return this.get(actor);
  },
};

/** Public sign-in branding for /login?workspace=<slug>: name, colours and logo only. */
export const publicBrandingService = {
  async bySlug(slug: string): Promise<BrandingDto & { organizationId: string }> {
    const org = await systemPrisma.organization.findUnique({ where: { slug }, select: { id: true, name: true, branding: true, status: true } });
    if (!org || org.status !== "ACTIVE") throw new NotFoundError();
    const logo = parseStoredLogo(org.branding);
    return {
      organizationId: org.id,
      name: org.name,
      colours: parseBranding(org.branding),
      logoUrl: logoUrl(logo, `/api/public/branding/${encodeURIComponent(slug)}/logo`),
    };
  },
};
