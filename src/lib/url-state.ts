import { z } from "zod";

/**
 * Pure helpers behind `useUrlState` (src/hooks/use-url-state.ts): a search page keeps its filters, search text,
 * sort, page and tab in the query string, so the URL *is* the page state (Favourites save and restore it as is).
 *
 * Rules:
 * - each key is validated on its own with the page's zod schema; a missing, invalid or old value falls back to the
 *   key's default (never a 400 from a stale link);
 * - defaults are left out of the URL; a filter whose default is not empty (e.g. `status: ACTIVE`) writes the explicit
 *   `all` sentinel when it is cleared – but only if its schema accepts `all`;
 * - changing anything resets `page` (the reset keys) unless the patch sets it;
 * - params the schema does not know are preserved.
 */

/** Explicit "no filter" value for filters whose default is not empty. */
export const URL_ALL = "all";

/** Keys reset when anything else changes. */
export const DEFAULT_RESET_KEYS: readonly string[] = ["page"];

/** Raw string patch: an empty string, `null` or `undefined` removes the key. */
export type RawUrlPatch = Record<string, string | null | undefined>;

type SearchInput = string | URLSearchParams | { toString(): string };

function toParams(search: SearchInput): URLSearchParams {
  return new URLSearchParams(typeof search === "string" ? search : search.toString());
}

/** How a value is written to the URL ("" = left out). */
export function serialiseUrlValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  return String(value);
}

function shapeOf(schema: z.ZodObject): Record<string, z.core.$ZodType> {
  return schema.shape as Record<string, z.core.$ZodType>;
}

/** The value a key has when it is not in the URL (`undefined` when the schema has no default). */
function defaultOf(keySchema: z.core.$ZodType): unknown {
  const result = z.safeParse(keySchema, undefined);
  return result.success ? result.data : undefined;
}

function accepts(keySchema: z.core.$ZodType, raw: string): boolean {
  return z.safeParse(keySchema, raw).success;
}

/** Reads the page state from a query string. Never throws: invalid keys get their default. */
export function parseUrlState<S extends z.ZodObject>(schema: S, search: SearchInput): z.output<S> {
  const params = toParams(search);
  const out: Record<string, unknown> = {};
  for (const [key, keySchema] of Object.entries(shapeOf(schema))) {
    const raw = params.get(key);
    if (raw === null || raw.trim() === "") {
      out[key] = defaultOf(keySchema);
      continue;
    }
    const result = z.safeParse(keySchema, raw);
    out[key] = result.success ? result.data : defaultOf(keySchema);
  }
  return out as z.output<S>;
}

/**
 * Applies raw string values to a query string and returns the new one (no leading "?"). Empty values remove the
 * key. When anything other than a reset key changed, the reset keys not named in the patch are removed.
 */
export function applyUrlPatch(search: SearchInput, patch: RawUrlPatch, resetKeys: readonly string[] = DEFAULT_RESET_KEYS): string {
  const params = toParams(search);
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    const next = value?.trim() ?? "";
    const counts = !resetKeys.includes(key);
    if (next === "") {
      if (params.has(key)) {
        params.delete(key);
        if (counts) changed = true;
      }
    } else if (params.get(key) !== next || params.getAll(key).length > 1) {
      params.set(key, next);
      if (counts) changed = true;
    }
  }
  if (changed) {
    for (const key of resetKeys) if (!(key in patch)) params.delete(key);
  }
  return params.toString();
}

/**
 * Converts a typed patch into URL values (defaults left out, `all` sentinel, invalid values dropped) and applies it
 * to `search`. Keys outside the schema are written as plain strings.
 */
export function buildUrlSearch<S extends z.ZodObject>(
  schema: S,
  search: SearchInput,
  patch: Partial<z.input<S>>,
  options?: { resetKeys?: readonly string[] },
): string {
  const shape = shapeOf(schema);
  const raw: RawUrlPatch = {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const keySchema = shape[key];
    const next = serialiseUrlValue(value);
    if (!keySchema) {
      raw[key] = next || null;
      continue;
    }
    const fallback = serialiseUrlValue(defaultOf(keySchema));
    if (next === "") raw[key] = fallback !== "" && accepts(keySchema, URL_ALL) ? URL_ALL : null;
    else if (next === fallback || !accepts(keySchema, next)) raw[key] = null;
    else raw[key] = next;
  }
  return applyUrlPatch(search, raw, options?.resetKeys ?? DEFAULT_RESET_KEYS);
}

/**
 * The tab to show: the URL value when it is allowed, else the fallback, else the first allowed tab (a saved tab the
 * user can no longer see falls back instead of showing an empty page).
 */
export function resolveUrlTab<T extends string>(raw: string | null | undefined, fallback: T, allowed?: readonly T[]): T {
  const value = raw?.trim();
  if (!allowed) return (value || fallback) as T;
  if (value && (allowed as readonly string[]).includes(value)) return value as T;
  if (allowed.includes(fallback) || allowed.length === 0) return fallback;
  return allowed[0];
}

/**
 * A search box's local text vs its URL value. `written` is the value this box last wrote and is waiting to see come back.
 * When the URL changes: our own write coming back clears `written` and leaves the box alone (the user may still be
 * typing); any other change (Back/Forward, a link, a favourite) replaces the box text.
 */
export interface SearchTextState {
  text: string;
  seen: string;
  written: string | null;
}

export function syncSearchText(state: SearchTextState, urlValue: string): SearchTextState {
  if (urlValue === state.seen) return state;
  if (state.written !== null && urlValue === state.written) return { ...state, seen: urlValue, written: null };
  return { text: urlValue === state.text.trim() ? state.text : urlValue, seen: urlValue, written: null };
}

/** Number of filters that differ from their defaults, ignoring keys such as `view`, `page`, `sort`, `dir`. */
export function countActiveFilters(state: Record<string, unknown>, schema: z.ZodObject, ignore: readonly string[] = ["view", "tab", "page", "sort", "dir"]): number {
  const shape = shapeOf(schema);
  let count = 0;
  for (const [key, keySchema] of Object.entries(shape)) {
    if (ignore.includes(key)) continue;
    if (serialiseUrlValue(state[key]) !== serialiseUrlValue(defaultOf(keySchema))) count++;
  }
  return count;
}
