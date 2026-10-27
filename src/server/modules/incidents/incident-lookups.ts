import "server-only";
import { CAUSE_GROUPS, CAUSE_LISTS, isRestrictedKind, REPORTEE_KINDS, REPORTEE_LISTS, type CauseGroupKey, type ReporteeKindKey } from "@/lib/incidents";
import { normaliseLabel, type LookupListKey } from "@/lib/lookups";
import type { DbClient } from "@/server/db/client";
import { ValidationError } from "@/server/http/errors";
import type { CauseDto, ReporteeDto } from "./incident.dto";

/** Incident pick-lists (causes, reportees, absence kinds …) – values are tenant LookupValues, never deleted. */

export async function causeCatalogue(db: DbClient): Promise<Map<string, CauseDto>> {
  const rows = await db.lookupValue.findMany({
    where: { listKey: { in: Object.values(CAUSE_LISTS) } },
    select: { id: true, label: true, listKey: true, isActive: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const groupOf = new Map<string, CauseGroupKey>(CAUSE_GROUPS.map((g) => [CAUSE_LISTS[g], g]));
  return new Map(rows.map((r) => [r.id, { id: r.id, label: r.label, group: groupOf.get(r.listKey)!, isActive: r.isActive }]));
}

export async function reporteeCatalogue(db: DbClient): Promise<Map<string, ReporteeDto>> {
  const rows = await db.lookupValue.findMany({
    where: { listKey: { in: Object.values(REPORTEE_LISTS) } },
    select: { id: true, label: true, listKey: true, isActive: true, notes: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const kindOf = new Map<string, ReporteeKindKey>(REPORTEE_KINDS.map((k) => [REPORTEE_LISTS[k], k]));
  return new Map(rows.map((r) => [r.id, { id: r.id, label: r.label, kind: kindOf.get(r.listKey)!, destination: r.notes, isActive: r.isActive }]));
}

/**
 * New selections must be active values of the catalogue; values already on the record stay valid
 * after deactivation (history is preserved).
 */
export function assertSelectable<T extends { isActive: boolean }>(catalogue: Map<string, T>, ids: readonly string[], current: readonly string[], what: string): void {
  for (const id of ids) {
    const value = catalogue.get(id);
    if (!value) throw new ValidationError(`Unknown ${what}.`);
    if (!value.isActive && !current.includes(id)) throw new ValidationError(`A deactivated ${what} cannot be chosen.`);
  }
}

/** A label from a pick-list (active, or the record's current value). Returns the stored label. */
export async function listLabel(db: DbClient, listKey: LookupListKey, value: string | null | undefined, current: string | null | undefined, what: string): Promise<string | null> {
  const clean = value?.trim();
  if (!clean) return null;
  if (current && normaliseLabel(current) === normaliseLabel(clean)) return current;
  const rows = await db.lookupValue.findMany({ where: { listKey, label: { equals: clean, mode: "insensitive" } }, select: { label: true, isActive: true } });
  const match = rows.find((r) => normaliseLabel(r.label) === normaliseLabel(clean));
  if (!match) throw new ValidationError(`Choose a ${what} from the list.`);
  if (!match.isActive) throw new ValidationError(`The ${what} “${match.label}” has been deactivated.`);
  return match.label;
}

/** Absence kind label → restricted flag (Restricted duties are excluded from days lost). */
export async function absenceKinds(db: DbClient): Promise<Map<string, { label: string; restricted: boolean; isActive: boolean }>> {
  const rows = await db.lookupValue.findMany({ where: { listKey: "incident.absence-kind" }, select: { label: true, code: true, isActive: true } });
  return new Map(rows.map((r) => [normaliseLabel(r.label), { label: r.label, restricted: isRestrictedKind(r), isActive: r.isActive }]));
}
