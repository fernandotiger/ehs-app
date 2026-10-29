"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { SeedKey } from "@/lib/favourites/route-registry";

/**
 * Capture store for create pages: a module-level store (no provider) that a create form registers
 * into, and the header star reads when the user adds the page to Favourites.
 *
 *   // in a create form (Phase C):
 *   useFavouriteCapture("incident.report", () => pickReport(values, fresh, fields), { disabled: anonymous ? "anonymous" : false });
 *
 * `read` is called only when the star's dialog opens, so it always sees the latest values. Each form's
 * `read` names the fields it keeps; `sanitiseSnapshot()` is the backstop. When `disabled` is set
 * (e.g. "Report anonymously" is on) the page is saved without what was typed and the dialog says why.
 */

export type CaptureDisabledReason = "anonymous" | "unavailable";

export interface FavouriteCaptureState {
  key: SeedKey;
  disabled: false | CaptureDisabledReason;
}

export type FavouriteCaptureRead = { key: SeedKey; disabled: CaptureDisabledReason } | { key: SeedKey; disabled: false; values: unknown };

interface Registration {
  token: number;
  state: FavouriteCaptureState;
  read: () => unknown;
}

let registrations: Registration[] = [];
let nextToken = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The most recently registered source (one create form per page). Stable reference between changes. */
function getState(): FavouriteCaptureState | null {
  return registrations.at(-1)?.state ?? null;
}

const getServerState = () => null;

/** Registers a capture source; returns a function that removes it. Exported for tests and non-React callers. */
export function registerFavouriteCapture(key: SeedKey, read: () => unknown, disabled: false | CaptureDisabledReason = false): () => void {
  const token = nextToken++;
  registrations = [...registrations, { token, state: { key, disabled }, read }];
  emit();
  return () => {
    registrations = registrations.filter((r) => r.token !== token);
    emit();
  };
}

/** What the current page's form offers right now (null when no create form is registered). */
export function readFavouriteCapture(): FavouriteCaptureRead | null {
  const current = registrations.at(-1);
  if (!current) return null;
  const { key, disabled } = current.state;
  if (disabled) return { key, disabled };
  try {
    return { key, disabled: false, values: current.read() };
  } catch {
    return { key, disabled: "unavailable" };
  }
}

/**
 * For create forms: offer the typed values to the Favourites star while the form is shown.
 * `enabled: false` registers nothing (a form component that is also used to edit a record).
 */
export function useFavouriteCapture(key: SeedKey, read: () => unknown, options: { disabled?: false | CaptureDisabledReason; enabled?: boolean } = {}) {
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  const disabled = options.disabled ?? false;
  const enabled = options.enabled ?? true;
  useEffect(() => (enabled ? registerFavouriteCapture(key, () => readRef.current(), disabled) : undefined), [key, disabled, enabled]);
}

/** For the star: which capture source (if any) is registered, re-rendering when it changes. */
export function useFavouriteCaptureState(): FavouriteCaptureState | null {
  return useSyncExternalStore(subscribe, getState, getServerState);
}
