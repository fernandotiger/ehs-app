/**
 * Law – legal content library: vocabulary, quarterly content packages (validation, merge, change
 * list) and the applicability rule that decides which checklists a legal profile sees.
 * Framework-free and pure (client, server, seed, tests). Ported from ../ehs-screens/app/law-model.ts.
 *
 * Package file (JSON), same field names as the prototype:
 *   { version: "2026.Q4", released: "2026-10-01", summary: "…",
 *     legislation: [{ id, title, reference, jurisdiction, domain, category, level, parentId, synopsis, sourceUrl, keywords[], active }],
 *     checklists:  [{ id, title, domain, category, requirements, legislationIds[], activityKeys[], keywords[], relatedIds[], active }] }
 * A package carries only new / amended items; installing merges them into the previous library.
 */

/** Registers (legal-content subjects, not the company structure). */
export const LAW_REGISTERS = ["Health & Safety", "Environment"] as const;
export type LawRegister = (typeof LAW_REGISTERS)[number];
/** Register of company-specific commitments ("other requirements"). */
export const OTHER_REGISTER = "Other requirements";
export const ALL_REGISTERS = [...LAW_REGISTERS, OTHER_REGISTER] as const;

export const LAW_CATEGORIES = ["General", "Workplace transport", "Machinery", "Chemical safety", "Waste", "Emissions"] as const;
export const LAW_ACTIVITIES = ["Workplace operations", "Workplace transport", "Machinery", "Chemicals", "Waste", "Air emissions"] as const;
export const LAW_LEVELS = ["Primary", "Secondary", "Tertiary"] as const;
export type LawLevel = (typeof LAW_LEVELS)[number];

/** Plain explanation of each level for the library screens. */
export const LAW_LEVEL_HINTS: Record<LawLevel, string> = {
  Primary: "Act – the main law",
  Secondary: "Regulations made under an Act",
  Tertiary: "Guidance or code of practice",
};

export interface LawLegislation {
  id: string;
  title: string;
  reference: string;
  jurisdiction: string;
  domain: LawRegister;
  category: string;
  level: LawLevel;
  /** "" for Primary legislation. */
  parentId: string;
  synopsis: string;
  sourceUrl: string;
  keywords: string[];
  active: boolean;
}

export interface LawChecklist {
  id: string;
  title: string;
  domain: LawRegister;
  category: string;
  requirements: string;
  legislationIds: string[];
  activityKeys: string[];
  keywords: string[];
  relatedIds: string[];
  active: boolean;
}

export interface LawContent {
  legislation: LawLegislation[];
  checklists: LawChecklist[];
}

export interface LawPackage extends LawContent {
  version: string;
  released: string;
  summary: string;
}

export interface LawContentChange {
  kind: "legislation" | "checklist";
  id: string;
  title: string;
  domain: string;
  change: "NEW" | "AMENDED";
}

/** What a profile needs for the applicability test. */
export interface ProfileScope {
  jurisdiction: string;
  activities: readonly string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** "2026.Q3" → 2026 × 4 + 3; 0 when malformed. */
export function versionRank(version: string): number {
  return /^\d{4}\.Q[1-4]$/.test(version) ? Number(version.slice(0, 4)) * 4 + Number(version.slice(-1)) : 0;
}

/** Only http(s) links are accepted as official / reference sources. */
export function isSafeUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    return ["https:", "http:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Does a content checklist apply to a profile? Active, matches at least one selected activity (not
 * all of them) and references at least one active piece of legislation in the profile's jurisdiction.
 */
export function checklistApplies(c: LawChecklist, profile: ProfileScope, content: LawContent): boolean {
  if (!c.active || !c.activityKeys.some((a) => profile.activities.includes(a))) return false;
  return c.legislationIds.some((id) => content.legislation.some((l) => l.id === id && l.active && l.jurisdiction === profile.jurisdiction));
}

export function applicableChecklists(content: LawContent, profile: ProfileScope): LawChecklist[] {
  return content.checklists.filter((c) => checklistApplies(c, profile, content));
}

/** Jurisdictions present in a library (the choices offered for a profile). */
export function jurisdictionsOf(content: LawContent): string[] {
  return [...new Set(content.legislation.map((l) => l.jurisdiction))].sort((a, b) => a.localeCompare(b));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Checklists whose saved evaluations need a review after moving from `before` to `after`: the
 * checklist itself changed, or a piece of legislation it references changed. Unchanged items are
 * never flagged.
 */
export function changedChecklistIds(before: LawContent, after: LawContent): Set<string> {
  const changedLegislation = new Set(after.legislation.filter((l) => !same(before.legislation.find((x) => x.id === l.id), l)).map((l) => l.id));
  const out = new Set<string>();
  for (const c of after.checklists) {
    const old = before.checklists.find((x) => x.id === c.id);
    if (!old) continue;
    if (!same(old, c) || c.legislationIds.some((id) => changedLegislation.has(id))) out.add(c.id);
  }
  return out;
}

/** New / amended items of a package compared with the library it is installed over. */
export function contentChanges(before: LawContent, pkg: LawContent): LawContentChange[] {
  const out: LawContentChange[] = [];
  for (const l of pkg.legislation) {
    const old = before.legislation.find((x) => x.id === l.id);
    if (!old || !same(old, l)) out.push({ kind: "legislation", id: l.id, title: l.title, domain: l.domain, change: old ? "AMENDED" : "NEW" });
  }
  for (const c of pkg.checklists) {
    const old = before.checklists.find((x) => x.id === c.id);
    if (!old || !same(old, c)) out.push({ kind: "checklist", id: c.id, title: c.title, domain: c.domain, change: old ? "AMENDED" : "NEW" });
  }
  return out;
}

/** Previous library with the package's items replaced in place and new ones appended. */
export function mergeContent(before: LawContent, pkg: LawContent): LawContent {
  const merge = <T extends { id: string }>(a: T[], b: T[]) => [...a.map((x) => b.find((y) => y.id === x.id) ?? x), ...b.filter((y) => !a.some((x) => x.id === y.id))];
  return { legislation: merge(before.legislation, pkg.legislation), checklists: merge(before.checklists, pkg.checklists) };
}

export const EMPTY_CONTENT: LawContent = { legislation: [], checklists: [] };

export type PackageCheck =
  | { ok: true; pkg: LawPackage; next: LawContent; changes: LawContentChange[]; rank: number }
  | { ok: false; problems: string[] };

const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const MAX_PROBLEMS = 8;

/**
 * Validates a package against the installed library (latest version) before anything is installed.
 * Reports up to 8 problems in plain words; nothing is partially installed on failure.
 */
export function validatePackage(raw: unknown, installed: { version: string; content: LawContent } | null): PackageCheck {
  const problems: string[] = [];
  const add = (p: string) => problems.length < MAX_PROBLEMS && problems.push(p);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, problems: ["The file must contain one legal-content package (a JSON object)."] };
  const p = raw as Record<string, unknown>;

  const version = typeof p.version === "string" ? p.version.trim() : "";
  const rank = versionRank(version);
  if (!rank) add("Give the package a version like 2026.Q4 (year, dot, Q1–Q4).");
  else if (installed && rank <= versionRank(installed.version)) add(`Version ${version} is not newer than the installed library (${installed.version}).`);
  if (!isValidDate(p.released)) add("Give a valid release date (yyyy-mm-dd).");
  if (!text(p.summary)) add("Add a short summary of what changed.");
  if (!Array.isArray(p.legislation) || !Array.isArray(p.checklists)) {
    add("The package needs a legislation list and a checklists list.");
    return { ok: false, problems };
  }
  if (!p.legislation.length && !p.checklists.length) add("The package contains no legislation or checklists.");

  const legislation: LawLegislation[] = [];
  const seenLeg = new Set<string>();
  p.legislation.forEach((v: unknown, i) => {
    const x = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const label = text(x.id) ? x.id : `legislation #${i + 1}`;
    if (![x.id, x.title, x.reference, x.jurisdiction, x.synopsis].every(text)) return add(`${label}: id, title, reference, jurisdiction and synopsis are required.`);
    if (!(LAW_LEVELS as readonly unknown[]).includes(x.level)) return add(`${label}: level must be Primary, Secondary or Tertiary.`);
    if (!(LAW_REGISTERS as readonly unknown[]).includes(x.domain)) return add(`${label}: register (domain) must be Health & Safety or Environment.`);
    if (!(LAW_CATEGORIES as readonly unknown[]).includes(x.category)) return add(`${label}: unknown category "${String(x.category)}".`);
    if (typeof x.parentId !== "string" || typeof x.active !== "boolean" || !strings(x.keywords)) return add(`${label}: parentId, keywords and active are required.`);
    if (!isSafeUrl(x.sourceUrl)) return add(`${label}: the source link must be an http(s) web address.`);
    if (seenLeg.has(x.id as string)) return add(`Duplicate legislation id ${String(x.id)}.`);
    seenLeg.add(x.id as string);
    legislation.push({
      id: (x.id as string).trim(),
      title: (x.title as string).trim(),
      reference: (x.reference as string).trim(),
      jurisdiction: (x.jurisdiction as string).trim(),
      domain: x.domain as LawRegister,
      category: x.category as string,
      level: x.level as LawLevel,
      parentId: (x.parentId as string).trim(),
      synopsis: (x.synopsis as string).trim(),
      sourceUrl: x.sourceUrl as string,
      keywords: (x.keywords as string[]).map((k) => k.trim()).filter(Boolean),
      active: x.active as boolean,
    });
  });

  const checklists: LawChecklist[] = [];
  const seenCl = new Set<string>();
  p.checklists.forEach((v: unknown, i) => {
    const x = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const label = text(x.id) ? x.id : `checklist #${i + 1}`;
    if (![x.id, x.title, x.requirements].every(text)) return add(`${label}: id, title and requirements are required.`);
    if (!(LAW_REGISTERS as readonly unknown[]).includes(x.domain)) return add(`${label}: register (domain) must be Health & Safety or Environment.`);
    if (!(LAW_CATEGORIES as readonly unknown[]).includes(x.category)) return add(`${label}: unknown category "${String(x.category)}".`);
    if (!strings(x.legislationIds) || !x.legislationIds.length) return add(`${label}: list at least one legislation id.`);
    if (!strings(x.activityKeys) || !x.activityKeys.length) return add(`${label}: list at least one activity.`);
    const unknownActivity = x.activityKeys.find((a) => !(LAW_ACTIVITIES as readonly string[]).includes(a));
    if (unknownActivity) return add(`${label}: unknown activity "${unknownActivity}".`);
    if (!strings(x.keywords) || !strings(x.relatedIds) || typeof x.active !== "boolean") return add(`${label}: keywords, relatedIds and active are required.`);
    if (seenCl.has(x.id as string)) return add(`Duplicate checklist id ${String(x.id)}.`);
    seenCl.add(x.id as string);
    checklists.push({
      id: (x.id as string).trim(),
      title: (x.title as string).trim(),
      domain: x.domain as LawRegister,
      category: x.category as string,
      requirements: (x.requirements as string).trim(),
      legislationIds: x.legislationIds as string[],
      activityKeys: x.activityKeys as string[],
      keywords: (x.keywords as string[]).map((k) => k.trim()).filter(Boolean),
      relatedIds: x.relatedIds as string[],
      active: x.active as boolean,
    });
  });
  if (problems.length) return { ok: false, problems };

  const before = installed?.content ?? EMPTY_CONTENT;
  const next = mergeContent(before, { legislation, checklists });
  for (const l of next.legislation) {
    const parent = next.legislation.find((x) => x.id === l.parentId);
    const badParent =
      l.level === "Primary"
        ? Boolean(l.parentId)
        : !parent || parent.level === "Tertiary" || (l.level === "Secondary" && parent.level !== "Primary") || parent.jurisdiction !== l.jurisdiction;
    if (badParent) {
      add(`${l.id}: invalid place in the legislation hierarchy (Primary has no parent; Secondary sits under Primary; Tertiary under Primary or Secondary, same jurisdiction).`);
      continue;
    }
    const seen = new Set([l.id]);
    let node = parent;
    while (node) {
      if (seen.has(node.id)) {
        add(`${l.id}: the legislation hierarchy contains a loop.`);
        break;
      }
      seen.add(node.id);
      node = next.legislation.find((x) => x.id === node!.parentId);
    }
  }
  for (const c of next.checklists) {
    const missing = c.legislationIds.filter((id) => !next.legislation.some((l) => l.id === id));
    if (missing.length) add(`${c.id}: refers to legislation that does not exist (${missing.join(", ")}).`);
    const missingRelated = c.relatedIds.filter((id) => !next.checklists.some((x) => x.id === id));
    if (missingRelated.length) add(`${c.id}: refers to checklists that do not exist (${missingRelated.join(", ")}).`);
  }
  const changes = contentChanges(before, { legislation, checklists });
  if (!problems.length && !changes.length) add("This package changes nothing compared with the installed library.");
  if (problems.length) return { ok: false, problems };
  return { ok: true, pkg: { version, released: p.released as string, summary: (p.summary as string).trim(), legislation, checklists }, next, changes, rank };
}

/** Reads a stored content Json (tolerates malformed rows). */
export function asContent(value: unknown): LawContent {
  if (!value || typeof value !== "object") return EMPTY_CONTENT;
  const v = value as Partial<LawContent>;
  return { legislation: Array.isArray(v.legislation) ? v.legislation : [], checklists: Array.isArray(v.checklists) ? v.checklists : [] };
}

export function asChanges(value: unknown): LawContentChange[] {
  return Array.isArray(value) ? (value as LawContentChange[]) : [];
}
