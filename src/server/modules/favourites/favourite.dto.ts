import type { FavouriteStatus } from "@/lib/favourites/rules";
import type { Snapshot } from "@/lib/favourites/snapshot";

/** Shapes returned by /api/favourites (dates as ISO strings). */

export type FavouriteKindKey = "PAGE" | "EXTERNAL";

export interface FavouriteListItem {
  id: string;
  kind: FavouriteKindKey;
  title: string;
  /** ICON_NAMES entry; null = the page's default icon (Globe for websites). */
  icon: string | null;
  /** TILE_COLOURS name; null = Default (company colour). */
  color: string | null;
  /** Cleaned in-app address ("/incidents/register?view=investigations") or a website address. */
  url: string;
  /** Typed details of a create page are kept (the values themselves only come from GET /api/favourites/:id). */
  hasSnapshot: boolean;
  /** Pure check against the route registry and the user's modules / permissions (websites are always "ok"). */
  status: FavouriteStatus;
  /** Plain explanation when blocked. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One favourite with its typed details – owner-only, never persisted in the browser cache. */
export interface FavouriteDetail extends FavouriteListItem {
  snapshot: Snapshot | null;
}
