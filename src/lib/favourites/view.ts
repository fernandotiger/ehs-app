import { MODULES } from "@/lib/modules";
import { websiteLabel } from "./external-url";
import { EXTERNAL_LINK_ICON, FALLBACK_PAGE_ICON, type IconName } from "./icon-names";
import type { RouteEntry } from "./route-registry";
import { favouriteChips, matchRoute } from "./rules";

/** How a kept favourite is shown on its tile (pure – derived from the registry, nothing stored). */

export interface FavouriteViewInput {
  id: string;
  kind: "PAGE" | "EXTERNAL";
  url: string;
  hasSnapshot: boolean;
}

export interface FavouriteView {
  entry: RouteEntry | null;
  external: boolean;
  defaultIcon: IconName;
  /** "Incidents · Incidents register" or "Website · hsa.ie". */
  subtitle: string;
  /** "Investigations tab", "4 filters", "Your typed details". */
  chips: string[];
  /** Where the tile goes: the kept address, plus `fav=<id>` when typed details are kept. */
  href: string;
}

export const TYPED_DETAILS_CHIP = "Your typed details";

export function pageSubtitle(entry: RouteEntry | null): string {
  if (!entry) return "Page";
  return entry.module ? `${MODULES[entry.module].name} · ${entry.title}` : entry.title;
}

export function favouriteView(item: FavouriteViewInput): FavouriteView {
  if (item.kind === "EXTERNAL") {
    return { entry: null, external: true, defaultIcon: EXTERNAL_LINK_ICON, subtitle: `Website · ${websiteLabel(item.url)}`, chips: [], href: item.url };
  }
  const entry = matchRoute(item.url);
  const chips = favouriteChips(entry, item.url);
  if (item.hasSnapshot) chips.push(TYPED_DETAILS_CHIP);
  const href = item.hasSnapshot ? `${item.url}${item.url.includes("?") ? "&" : "?"}fav=${encodeURIComponent(item.id)}` : item.url;
  return { entry, external: false, defaultIcon: entry?.icon ?? FALLBACK_PAGE_ICON, subtitle: pageSubtitle(entry), chips, href };
}
