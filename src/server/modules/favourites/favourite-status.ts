import { isOffered, type RouteEntry } from "@/lib/favourites/route-registry";
import { bookmarkability, cleanPagePath, favouriteStatus, matchRoute, routeAccess, statusReason, type AccessUser, type FavouriteStatus } from "@/lib/favourites/rules";
import type { FavouriteKindKey } from "./favourite.dto";

/**
 * Pure helpers of the Favourites service (no database): the status shown on each tile and the
 * re-check made before a page is kept.
 */

export function itemStatus(kind: FavouriteKindKey, url: string, user: AccessUser): { status: FavouriteStatus; reason: string | null } {
  if (kind === "EXTERNAL") return { status: "ok", reason: null };
  const entry = matchRoute(url);
  const status = favouriteStatus(entry, user, url);
  return { status, reason: statusReason(status, entry) };
}

export type PageCheck = { ok: true; entry: RouteEntry; url: string } | { ok: false; message: string };

/** Re-checks a page before it is kept: registry, the user's access, earlier step, address rules. */
export function checkPageForFavourite(rawUrl: string, user: AccessUser): PageCheck {
  const entry = matchRoute(rawUrl);
  if (!isOffered(entry)) return { ok: false, message: "This page can't be a favourite. Only search pages (like the Incidents register) and create pages (like Report incident) can be kept." };
  if (!routeAccess(entry, user)) return { ok: false, message: "You can't open this page, so it can't be a favourite." };
  if (bookmarkability(entry, rawUrl) === "needs-previous-step") return { ok: false, message: entry.previousStep?.reason ?? "This page needs an earlier step, so it can't be a favourite." };
  const url = cleanPagePath(rawUrl);
  if (!url) return { ok: false, message: "This page address is too long to keep as a favourite." };
  return { ok: true, entry, url };
}
