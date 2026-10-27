import { z } from "zod";

/**
 * Tenant branding (Organization.branding JSON). Colours are six-digit hex values; the app shell
 * turns them into CSS variables (--brand, --brand-dark, --brand-light, --brand-soft, --primary and
 * readable foregrounds) so every component picks them up. Status colours (--success, --warning,
 * --destructive, --info) are never overridden. Safe for client and server.
 *
 * Stored shape: { primary?, secondary?, tertiary?, logo?: StoredLogo }
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const brandingColoursSchema = z.object({
  primary: hex.optional(),
  secondary: hex.optional(),
  tertiary: hex.optional(),
});
export type BrandingColours = z.infer<typeof brandingColoursSchema>;

/** Default palette (matches globals.css) – used for previews and "reset to default". */
export const DEFAULT_BRAND_COLOURS = { primary: "#3b5382", secondary: "#293d5d", tertiary: "#567ebc" } as const;

/** Server-side record of the stored logo file (never sent to the client as-is). */
export interface StoredLogo {
  storageDriver: string;
  storageKey: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  updatedAt: string;
}

/** Reads the stored JSON defensively: invalid colours are dropped, never injected into CSS. */
export function parseBranding(value: unknown): BrandingColours {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const out: BrandingColours = {};
  for (const key of ["primary", "secondary", "tertiary"] as const) {
    const parsed = hex.safeParse(source[key]);
    if (parsed.success) out[key] = parsed.data.toLowerCase();
  }
  return out;
}

const storedLogoSchema = z.object({
  storageDriver: z.string().min(1),
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  fileName: z.string(),
  sizeBytes: z.number(),
  updatedAt: z.string(),
});

export function parseStoredLogo(value: unknown): StoredLogo | null {
  if (!value || typeof value !== "object") return null;
  const parsed = storedLogoSchema.safeParse((value as Record<string, unknown>).logo);
  return parsed.success ? parsed.data : null;
}

// ── Contrast (WCAG relative luminance) ──────────────────────────────────────

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(colour: string): number {
  const v = colour.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#111827";

/** White or near-black – whichever reads better on the given background. */
export function readableTextColour(background: string): string {
  return contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

/** CSS overriding the default palette with the tenant's colours ("" when nothing is set). */
export function brandingCss(colours: BrandingColours): string {
  const { primary, secondary, tertiary } = colours;
  if (!primary && !secondary && !tertiary) return "";
  const light: string[] = [];
  const dark: string[] = [];
  if (primary) {
    const fg = readableTextColour(primary);
    light.push(`--brand:${primary}`, `--brand-primary:${primary}`, `--primary:${primary}`, `--sidebar-primary:${primary}`, `--ring:${primary}`);
    light.push(`--brand-foreground:${fg}`, `--primary-foreground:${fg}`, `--sidebar-primary-foreground:${fg}`);
    light.push(`--brand-soft:color-mix(in srgb, ${primary} 12%, white)`);
    dark.push(`--brand-soft:color-mix(in srgb, ${primary} 25%, #0f1522)`);
  }
  if (secondary) light.push(`--brand-dark:${secondary}`, `--brand-secondary:${secondary}`, `--brand-dark-foreground:${readableTextColour(secondary)}`);
  if (tertiary) light.push(`--brand-light:${tertiary}`, `--brand-tertiary:${tertiary}`);
  return `:root{${light.join(";")}}` + (dark.length ? `.dark{${dark.join(";")}}` : "");
}

/** Authorised logo URL with a cache-busting version (null → default mark). */
export function logoUrl(logo: StoredLogo | null, base = "/api/configuration/branding/logo"): string | null {
  return logo ? `${base}?v=${encodeURIComponent(logo.updatedAt)}` : null;
}

/** Public, client-safe branding of a tenant (app shell, login page, Configuration → Branding). */
export interface BrandingDto {
  name: string;
  colours: BrandingColours;
  /** Authorised URL of the logo (with a cache-busting version), or null for the default mark. */
  logoUrl: string | null;
}
