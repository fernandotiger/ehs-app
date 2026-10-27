/**
 * Pure rules for incident types (Configuration → Incident settings): clean names, generated keys,
 * name clashes and the settings gates shared by create and update. No `server-only` – unit tested.
 */
import { normaliseLabel } from "@/lib/lookups";
import { INCIDENT_TYPE_CATALOGUE, INCIDENT_TYPE_KEYS, RETIRED_CATALOGUE } from "./catalogue";

/** Trimmed, single-spaced name (what is stored and shown). */
export function cleanTypeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/, "") || "type"
  );
}

/**
 * Stable key for a new type ("chemical-exposure", "chemical-exposure-2", …). Never changes after
 * creation (renaming keeps it). Built-in, follow-up routing and retired catalogue keys stay
 * reserved so a type created by an administrator can never take one over.
 */
export function typeKeyFor(name: string, usedKeys: Iterable<string>): string {
  const used = new Set([...usedKeys, ...INCIDENT_TYPE_CATALOGUE.map((t) => t.key), ...Object.values(INCIDENT_TYPE_KEYS), ...RETIRED_CATALOGUE.types]);
  const base = slugify(name);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** The type (active or not) that already uses this name, ignoring case and spacing. */
export function typeNameClash<T extends { id: string; name: string }>(name: string, types: T[], excludeId?: string): T | undefined {
  const wanted = normaliseLabel(name);
  return types.find((t) => t.id !== excludeId && normaliseLabel(t.name) === wanted);
}

export interface TypeSettingsFacts {
  isActive: boolean;
  reportFormId: string | null;
  investigationRequired: boolean;
  /** Already cleared when investigations are disabled. */
  investigationFormId: string | null;
}

/** First settings rule a type breaks (plain words for the 422 answer), or null. */
export function typeSettingsProblem(s: TypeSettingsFacts): { message: string; blockers: string[] } | null {
  if (s.investigationRequired && !s.investigationFormId) {
    return {
      message: "An investigation can only be required when a published Investigation form is bound.",
      blockers: ["Choose a published Investigation form, or make the investigation optional."],
    };
  }
  if (s.isActive && !s.reportFormId) {
    return { message: "An active type needs a published Report form.", blockers: ["Choose a published Report form for this type."] };
  }
  return null;
}
