"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { applyUrlPatch, buildUrlSearch, DEFAULT_RESET_KEYS, parseUrlState, resolveUrlTab, syncSearchText, type RawUrlPatch, type SearchTextState } from "@/lib/url-state";

export { applyUrlPatch, buildUrlSearch, countActiveFilters, parseUrlState, resolveUrlTab, URL_ALL, type RawUrlPatch } from "@/lib/url-state";

/**
 * Search pages keep their state in the query string (see src/lib/url-state.ts). Writes use the native History API,
 * which Next 16 syncs into `useSearchParams` without a server round trip (the page guard does not re-run).
 *
 * Next's patched `history.replaceState` treats a state object carrying its own `__NA`/`_N` markers as an internal
 * call and then does NOT sync `useSearchParams`; it copies those markers itself. So the current state is passed on
 * without them – Back keeps working and the router sees the new URL.
 */
export function replaceUrlSearch(search: string): void {
  if (typeof window === "undefined") return;
  const next = new URLSearchParams(search).toString();
  if (new URLSearchParams(window.location.search).toString() === next) return;
  const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { __NA, _N, ...state } = (window.history.state ?? {}) as Record<string, unknown>;
  window.history.replaceState(state, "", url);
}

/** Writes raw values into the current URL, built from `window.location.search` at write time. */
export function patchUrlParams(patch: RawUrlPatch, resetKeys: readonly string[] = []): void {
  if (typeof window === "undefined") return;
  replaceUrlSearch(applyUrlPatch(window.location.search, patch, resetKeys));
}

/** Removes one-time params (e.g. `open`, `new`) from the URL. */
export function stripUrlParams(keys: readonly string[]): void {
  patchUrlParams(Object.fromEntries(keys.map((k) => [k, null])));
}

/**
 * For writes made while a page mounts (stripping one-time params, the resolved law profile): Next patches the
 * History API in an effect that runs after the page's own effects, so the write waits a tick. Returns a cleanup.
 */
export function deferUrlPatch(patch: RawUrlPatch, resetKeys: readonly string[] = []): () => void {
  const timer = window.setTimeout(() => patchUrlParams(patch, resetKeys), 0);
  return () => window.clearTimeout(timer);
}

/**
 * Page state from the URL, parsed on every render (never copied into state – same-path links don't remount pages).
 * `schema` must be a module-level constant. The setter resets `page` (or `resetKeys`) when anything else changes.
 */
export function useUrlState<S extends z.ZodObject>(
  schema: S,
  options?: { resetKeys?: readonly string[] },
): [z.output<S>, (patch: Partial<z.input<S>>) => void] {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const state = useMemo(() => parseUrlState(schema, search), [schema, search]);
  const resetKeys = (options?.resetKeys ?? DEFAULT_RESET_KEYS).join(",");
  const setState = useCallback(
    (patch: Partial<z.input<S>>) => {
      if (typeof window === "undefined") return;
      const keys = resetKeys ? resetKeys.split(",") : [];
      replaceUrlSearch(buildUrlSearch(schema, window.location.search, patch, { resetKeys: keys }));
    },
    [schema, resetKeys],
  );
  return [state, setState];
}

/**
 * Search box text: typed locally and written to the URL `delay` ms after the last key press (resetting `page`).
 * The URL value is copied back into the box only when it changed from outside (a link, Back, "Clear filters").
 * Read the value used for the query from the URL (`useUrlState`), not from this text.
 */
export function useUrlSearchText(key = "q", delay = 300): [string, (value: string) => void] {
  const urlValue = useSearchParams().get(key) ?? "";
  const [state, setState] = useState<SearchTextState>({ text: urlValue, seen: urlValue, written: null });
  const synced = syncSearchText(state, urlValue);
  if (synced !== state) setState(synced);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onChange = useCallback(
    (value: string) => {
      setState((s) => ({ ...s, text: value }));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const next = value.trim();
        // Only wait for an echo when the write really changes the URL (an unchanged URL is not written).
        if ((new URLSearchParams(window.location.search).get(key) ?? "") === next) return;
        setState((s) => ({ ...s, written: next }));
        patchUrlParams({ [key]: next || null }, DEFAULT_RESET_KEYS);
      }, delay);
    },
    [key, delay, setState],
  );
  return [synced.text, onChange];
}

/**
 * Tab kept in the URL (`fallback` is left out). A saved tab that is no longer allowed falls back to `fallback`, or to
 * the first allowed tab. Spread into shadcn `<Tabs {...tab}>`.
 */
export function useUrlTab<T extends string>(key: string, fallback: T, allowed?: readonly T[]): { value: T; onValueChange: (value: string) => void } {
  const raw = useSearchParams().get(key);
  const value = resolveUrlTab(raw, fallback, allowed);
  const onValueChange = useCallback((next: string) => patchUrlParams({ [key]: next === fallback ? null : next }, DEFAULT_RESET_KEYS), [key, fallback]);
  return { value, onValueChange };
}
