"use client";

import type { RouteEntry } from "@/lib/favourites/route-registry";
import { describeKept } from "@/lib/favourites/rules";
import { sanitiseSnapshot, snapshotTooLarge, type Snapshot } from "@/lib/favourites/snapshot";
import { readFavouriteCapture } from "./use-favourite-capture";

/** What the star's dialog keeps for the current page: the typed values of a create page (if any) and the plain "what is kept" line. */
export interface CaptureSummary {
  snapshot: Snapshot | null;
  /** "This page · Investigations tab · search “forklift” + 3 filters" / "What you typed (files are not kept)". */
  kept: string;
  /** Why what was typed is not kept (anonymous report, too long, …). */
  note: string | null;
}

// "Only you can see what's kept." follows in the dialog.
export const TYPED_KEPT_LINE = "What you typed (files are not kept)";
export const EMPTY_FORM_LINE = "This page (an empty form)";

const NOTES = {
  anonymous: "“Report anonymously” is switched on, so what you typed is not kept – keeping it under your name would link you to the report. The empty page is saved.",
  unavailable: "What you typed can't be kept on this page, so the empty page is saved.",
  tooLarge: "What you typed is too long to keep (16 KB at most), so the empty page is saved.",
};

/** Reads the create form's capture source (Phase C forms register one) when the dialog opens. */
export function summariseCapture(entry: RouteEntry, url: string): CaptureSummary {
  if (entry.kind !== "create") return { snapshot: null, kept: describeKept(entry, url), note: null };
  const capture = entry.seed ? readFavouriteCapture() : null;
  if (!capture || capture.key !== entry.seed) return { snapshot: null, kept: EMPTY_FORM_LINE, note: null };
  if (capture.disabled) return { snapshot: null, kept: EMPTY_FORM_LINE, note: NOTES[capture.disabled] };
  const snapshot = sanitiseSnapshot(capture.values);
  if (!snapshot) return { snapshot: null, kept: EMPTY_FORM_LINE, note: null };
  if (snapshotTooLarge(snapshot)) return { snapshot: null, kept: EMPTY_FORM_LINE, note: NOTES.tooLarge };
  return { snapshot, kept: TYPED_KEPT_LINE, note: null };
}

/** The empty version of a page (plain alternative, or nothing to capture). */
export function emptyCapture(entry: RouteEntry, url: string): CaptureSummary {
  return { snapshot: null, kept: entry.kind === "create" ? EMPTY_FORM_LINE : describeKept(entry, url), note: null };
}
