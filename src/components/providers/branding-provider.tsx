"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { brandingCss, type BrandingColours, type BrandingDto } from "@/lib/branding";

interface BrandingContextValue {
  /** Saved branding (from the server) with any live preview applied. */
  branding: BrandingDto;
  /** Live preview while editing Configuration → Branding (null = saved colours). */
  setPreview: (colours: BrandingColours | null) => void;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

/**
 * Tenant branding for the whole app: injects the colour CSS variables (portals included, since
 * they are set on :root) and exposes the logo URL to the sidebar. Configuration → Branding uses
 * `setPreview` so colour changes apply immediately, before they are saved.
 */
export function BrandingProvider({ branding, children }: { branding: BrandingDto; children: React.ReactNode }) {
  const [preview, setPreview] = useState<BrandingColours | null>(null);
  const colours = preview ?? branding.colours;
  const css = brandingCss(colours);
  const value = useMemo(() => ({ branding: { ...branding, colours }, setPreview }), [branding, colours]);
  return (
    <BrandingContext.Provider value={value}>
      {css && <style data-tenant-branding>{css}</style>}
      {children}
    </BrandingContext.Provider>
  );
}

const FALLBACK: BrandingContextValue = { branding: { name: "", colours: {}, logoUrl: null }, setPreview: () => undefined };

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext) ?? FALLBACK;
}
