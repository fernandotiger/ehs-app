import { isEmptyValue, type FormFieldDefinition, type FormFieldType, type FormValues } from "@/lib/forms";
import type { SeedKey } from "./route-registry";
import { matchRoute } from "./rules";
import type { Snapshot } from "./snapshot";

/**
 * Pure helpers for create-page "seeds" – the typed values kept with a favourite (see brief 09 §2B).
 *
 * Each create form has its own `pick` (what to keep) and `merge(fresh, saved, context)` (how a kept
 * value goes back into a fresh form). These helpers make both sides defensive: a seed was written by
 * an older version of the form, the company's lists may have changed since, and it comes back from
 * the server as plain JSON – every value is re-checked, anything odd falls back to the fresh value.
 */

// ── Which favourite feeds which page ────────────────────────────────────────

export type SeedCheck = { ok: true; seed: Snapshot } | { ok: false; reason: "empty" | "other-page" };

/** The kept values of `favourite` when it belongs to the create page whose seed key is `key`. */
export function seedForPage(favourite: { kind: string; url: string; snapshot: Snapshot | null | undefined }, key: SeedKey): SeedCheck {
  if (favourite.kind !== "PAGE" || matchRoute(favourite.url)?.seed !== key) return { ok: false, reason: "other-page" };
  const snapshot = favourite.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !Object.keys(snapshot).length) return { ok: false, reason: "empty" };
  return { ok: true, seed: snapshot };
}

// ── Reading kept values (undefined = not kept or not usable → keep the fresh value) ──

/** The kept value, or the fresh one when nothing usable was kept (`null` is a kept "none", unlike with `??`). */
export function orFresh<T>(value: T | undefined, fresh: T): T {
  return value === undefined ? fresh : value;
}

export function seedObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** A kept text, cut to `max` characters. */
export function seedText(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

/** A kept text or an explicit "none" (null). */
export function seedTextOrNull(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  const text = seedText(value, max);
  return text === undefined ? undefined : text.trim() ? text : null;
}

export function seedBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function seedInt(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

export function seedEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A kept record id (person, department …) or an explicit "none" (null). With `known`, an id that no
 * longer exists is not usable (→ the fresh value is kept).
 */
export function seedId(value: unknown, known?: readonly string[]): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !ID.test(value)) return undefined;
  return !known || known.includes(value) ? value : undefined;
}

/** Kept ids without duplicates; with `known`, ids that no longer exist are dropped. */
export function seedIds(value: unknown, max: number, known?: readonly string[]): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    const id = seedId(item, known);
    if (id && !out.includes(id)) out.push(id);
  }
  return out.slice(0, max);
}

// ── Picking ─────────────────────────────────────────────────────────────────

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The `keys` of `values` the user changed from the fresh form. Values equal to the fresh form are left
 * out: restoring them gives the same result, and a form nobody typed in keeps nothing (no "Your typed
 * details" chip on an empty page).
 */
export function pickChanged<V extends object, K extends keyof V>(values: V, fresh: V, keys: readonly K[]): Partial<Pick<V, K>> {
  const out: Partial<Pick<V, K>> = {};
  for (const key of keys) if (!same(values[key], fresh[key])) out[key] = values[key];
  return out;
}

// ── Questionnaire answers ───────────────────────────────────────────────────

/**
 * Answer types a seed keeps: text and choices. Never files (uploads expire), and never dates or times –
 * on a create page they describe this event ("when did it happen"), not a reusable starting point.
 */
export const SEED_ANSWER_TYPES: readonly FormFieldType[] = ["text", "textarea", "number", "select", "multiselect", "radio", "checkbox", "boolean", "person"];

const TEXT_MAX = 10_000;

function optionValues(field: FormFieldDefinition): string[] | null {
  return field.options?.length ? field.options.map((o) => o.value) : null;
}

/** One answer re-checked against its question; undefined = not kept. */
function answerFor(field: FormFieldDefinition, value: unknown): unknown {
  if (!SEED_ANSWER_TYPES.includes(field.type) || isEmptyValue(value)) return undefined;
  switch (field.type) {
    case "text":
    case "textarea":
      return typeof value === "string" ? value.slice(0, TEXT_MAX) : undefined;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    case "checkbox":
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "person":
      return seedId(value) ?? undefined;
    case "select":
    case "radio": {
      const options = optionValues(field);
      return typeof value === "string" && (!options || options.includes(value)) ? value : undefined;
    }
    case "multiselect": {
      if (!Array.isArray(value)) return undefined;
      const options = optionValues(field);
      const picked = value.filter((v): v is string => typeof v === "string" && (!options || options.includes(v)));
      return picked.length ? [...new Set(picked)] : undefined;
    }
    default:
      return undefined;
  }
}

function answersFor(fields: readonly FormFieldDefinition[], answers: unknown): FormValues {
  const source = seedObject(answers);
  const out: FormValues = {};
  if (!source) return out;
  for (const field of fields) {
    if (!Object.hasOwn(source, field.key)) continue;
    const value = answerFor(field, source[field.key]);
    if (value !== undefined) out[field.key] = value;
  }
  return out;
}

/** Capture side: the text and choice answers to the form's current questions (files, dates and unknown keys left out). */
export function pickSeedAnswers(fields: readonly FormFieldDefinition[], answers: FormValues): FormValues {
  return answersFor(fields, answers);
}

/**
 * Restore side: kept answers filtered to the form's questions as they are now (removed questions and
 * removed choice options are dropped). Without `fields` (the form's questions load later) only the
 * shapes text and choice answers can have are kept – files (objects) never come back.
 */
export function mergeSeedAnswers(saved: unknown, fields?: readonly FormFieldDefinition[]): FormValues {
  if (fields) return answersFor(fields, saved);
  const source = seedObject(saved);
  const out: FormValues = {};
  if (!source) return out;
  for (const [key, value] of Object.entries(source)) {
    if (isEmptyValue(value)) continue;
    if (typeof value === "string") out[key] = value.slice(0, TEXT_MAX);
    else if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") out[key] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) out[key] = value;
  }
  return out;
}
