import type { ModuleKey } from "@/lib/modules";
import type { Permission } from "@/lib/permissions";
import { normaliseExternalUrl, URL_MAX_LENGTH } from "./external-url";
import { isOffered, ROUTES, type RouteEntry } from "./route-registry";

/**
 * Pure Favourites rules, shared by the browser (star, tiles) and the API (re-checks on save and
 * status on list). Page guards stay the real gate – these rules only decide what can be kept and
 * how a kept favourite is shown.
 */

export type Bookmarkability = "ok" | "needs-previous-step" | "not-offered";
export type FavouriteStatus = "ok" | "no-access" | "needs-previous-step" | "gone";

export interface AccessUser {
  permissions: readonly Permission[];
  enabledModules: readonly ModuleKey[];
}

/** Query keys never kept in a favourite (one-time or sensitive), on top of each route's `oneTimeParams`. */
export const GLOBAL_STRIPPED_PARAMS = ["fav", "uploadId", "token", "password", "next", "open", "new"] as const;

/** Keys that are not filters (tile chip "4 filters" and the "what is kept" line). */
const NOT_FILTERS = new Set(["page", "pageSize", "sort", "dir", "q"]);

const BASE = "http://favourites.invalid";

// ── Route matching ──────────────────────────────────────────────────────────

interface CompiledRoute {
  entry: RouteEntry;
  segments: string[];
}

let compiled: CompiledRoute[] | null = null;

function routes(): CompiledRoute[] {
  compiled ??= ROUTES.map((entry) => ({ entry, segments: splitPath(entry.pattern) }));
  return compiled;
}

function splitPath(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

const isDynamic = (segment: string) => segment.startsWith("[") && segment.endsWith("]");

/** Static segments beat `[id]` at the first position where two matching patterns differ (like Next.js). */
function moreSpecific(a: string[], b: string[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const da = isDynamic(a[i]!);
    const db = isDynamic(b[i]!);
    if (da !== db) return !da;
  }
  return false;
}

/** The registry entry for a path ("/incidents/register", "/incidents/abc123"); query and hash are ignored. */
export function matchRoute(pathname: string): RouteEntry | null {
  const path = pathname.split(/[?#]/, 1)[0] ?? "";
  const segments = splitPath(path);
  let best: CompiledRoute | null = null;
  for (const route of routes()) {
    if (route.segments.length !== segments.length) continue;
    if (!route.segments.every((s, i) => isDynamic(s) || s === segments[i])) continue;
    if (!best || moreSpecific(route.segments, best.segments)) best = route;
  }
  return best?.entry ?? null;
}

// ── URLs ────────────────────────────────────────────────────────────────────

/** Parses an in-app address ("/path?query"). Null for absolute, protocol-relative ("//host") or odd input. */
function parseRelative(url: string): URL | null {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return null;
  try {
    const parsed = new URL(url, BASE);
    return parsed.origin === BASE ? parsed : null;
  } catch {
    return null;
  }
}

function normalisePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
}

/**
 * The address kept for an in-app page: relative only, without one-time and sensitive keys (global
 * list + the route's `oneTimeParams`), empty values and the hash, keys sorted. Null when the address
 * is not an in-app page or is longer than 2 000 characters.
 */
export function cleanPagePath(url: string): string | null {
  const parsed = parseRelative(url);
  if (!parsed) return null;
  const pathname = normalisePathname(parsed.pathname);
  const entry = matchRoute(pathname);
  const stripped = new Set<string>([...GLOBAL_STRIPPED_PARAMS, ...(entry?.oneTimeParams ?? [])]);
  const params = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) {
    if (stripped.has(key) || value.trim() === "") continue;
    params.append(key, value);
  }
  params.sort();
  const query = params.toString();
  const result = query ? `${pathname}?${query}` : pathname;
  return result.length > URL_MAX_LENGTH ? null : result;
}

/** Whether the page at this (raw, uncleaned) address can be added. */
export function bookmarkability(entry: RouteEntry | null | undefined, url: string): Bookmarkability {
  if (!isOffered(entry)) return "not-offered";
  const parsed = parseRelative(url);
  if (!parsed) return "not-offered";
  if (entry.previousStep && entry.oneTimeParams?.some((key) => (parsed.searchParams.get(key) ?? "").trim() !== "")) return "needs-previous-step";
  return "ok";
}

/** The page guard's coarse check: module enabled and any of the permissions (none listed = everyone). */
export function routeAccess(entry: RouteEntry, user: AccessUser): boolean {
  if (entry.module && !user.enabledModules.includes(entry.module)) return false;
  if (entry.permissions?.length && !entry.permissions.some((p) => user.permissions.includes(p))) return false;
  return true;
}

/** Status of a kept page favourite (address as stored). No record checks – the page does those. */
export function favouriteStatus(entry: RouteEntry | null | undefined, user: AccessUser, url: string): FavouriteStatus {
  if (!isOffered(entry) || cleanPagePath(url) === null) return "gone";
  if (!routeAccess(entry, user)) return "no-access";
  if (bookmarkability(entry, url) === "needs-previous-step") return "needs-previous-step";
  return "ok";
}

export const NO_ACCESS_REASON = "You can no longer open this page. Your role or your company's modules changed. Ask your administrator if you need it again.";
export const GONE_REASON = "This page no longer exists, or it can no longer be kept as a favourite.";

/** Plain explanation of a blocked favourite (null when it opens normally). */
export function statusReason(status: FavouriteStatus, entry: RouteEntry | null | undefined): string | null {
  switch (status) {
    case "ok":
      return null;
    case "no-access":
      return NO_ACCESS_REASON;
    case "needs-previous-step":
      return entry?.previousStep?.reason ?? "This page needs an earlier step before it can be opened.";
    case "gone":
      return GONE_REASON;
  }
}

/** Both addresses point at the same favourite (same cleaned page address, or the same website). */
export function sameFavourite(a: string, b: string): boolean {
  if (a.startsWith("/") || b.startsWith("/")) {
    const ca = cleanPagePath(a);
    return ca !== null && ca === cleanPagePath(b);
  }
  const ea = normaliseExternalUrl(a);
  const eb = normaliseExternalUrl(b);
  return ea.ok && eb.ok && ea.url === eb.url;
}

// ── Describing a kept page ──────────────────────────────────────────────────

export interface PageUrlState {
  /** Label of the selected tab when it is not the page's default. */
  tabLabel: string | null;
  /** Search text (`q`). */
  search: string | null;
  /** Other filters set in the address (not page, sort, search, tab or one-time keys). */
  filterCount: number;
}

export function describePageUrl(entry: RouteEntry | null | undefined, url: string): PageUrlState {
  const parsed = parseRelative(url);
  if (!parsed || !entry) return { tabLabel: null, search: null, filterCount: 0 };
  const params = parsed.searchParams;
  const tabValue = entry.tab ? params.get(entry.tab.key) : null;
  const tabLabel = entry.tab && tabValue && tabValue !== entry.tab.default ? (entry.tab.labels[tabValue] ?? null) : null;
  const search = params.get("q")?.trim() || null;
  const skip = new Set<string>([...NOT_FILTERS, ...GLOBAL_STRIPPED_PARAMS, ...(entry.oneTimeParams ?? []), ...(entry.tab ? [entry.tab.key] : [])]);
  const keys = new Set<string>();
  for (const [key, value] of params) if (!skip.has(key) && value.trim() !== "") keys.add(key);
  return { tabLabel, search, filterCount: keys.size };
}

/** "Incidents register – Investigations" – the title the add dialog starts with. */
export function defaultFavouriteTitle(entry: RouteEntry, url: string): string {
  const { tabLabel } = describePageUrl(entry, url);
  return (tabLabel ? `${entry.title} – ${tabLabel}` : entry.title).slice(0, 60);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "This page · Investigations tab · search “forklift” + 3 filters" – the dialog's "what is kept" line for a search page. */
export function describeKept(entry: RouteEntry, url: string): string {
  const { tabLabel, search, filterCount } = describePageUrl(entry, url);
  const parts = ["This page"];
  if (tabLabel) parts.push(`${tabLabel} tab`);
  if (search && filterCount) parts.push(`search “${search}” + ${plural(filterCount, "filter")}`);
  else if (search) parts.push(`search “${search}”`);
  else if (filterCount) parts.push(plural(filterCount, "filter"));
  return parts.join(" · ");
}

/** Tile chips: "Investigations tab", "4 filters" (the search text counts as one). */
export function favouriteChips(entry: RouteEntry | null | undefined, url: string): string[] {
  const { tabLabel, search, filterCount } = describePageUrl(entry, url);
  const chips: string[] = [];
  if (tabLabel) chips.push(`${tabLabel} tab`);
  const filters = filterCount + (search ? 1 : 0);
  if (filters) chips.push(plural(filters, "filter"));
  return chips;
}
