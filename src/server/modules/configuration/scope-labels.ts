import "server-only";
import { SCOPE_LABELS, scopeKey, type ScopeTypeKey } from "@/lib/scope";
import type { DbClient } from "@/server/db/client";
import { ValidationError } from "@/server/http/errors";

export interface ScopeRefInput {
  scopeType: ScopeTypeKey;
  scopeId: string | null;
}

export interface ResolvedScope {
  scopeType: ScopeTypeKey;
  scopeId: string | null;
  scopeKey: string;
  label: string;
}

/** "Site · Dublin Plant", "Department · Engineering (Production Floor)", "Whole company". */
export function formatScopeLabel(type: ScopeTypeKey, name: string | null, parentName?: string | null): string {
  if (type === "COMPANY") return SCOPE_LABELS.COMPANY;
  if (!name) return `${SCOPE_LABELS[type]} · (removed)`;
  return `${SCOPE_LABELS[type]} · ${name}${parentName ? ` (${parentName})` : ""}`;
}

/**
 * Validates an assignment scope against the tenant's structure (tenant-scoped client, so a
 * foreign id is "not found"). Inactive nodes cannot receive new assignments.
 */
export async function resolveScope(db: DbClient, input: ScopeRefInput): Promise<ResolvedScope> {
  if (input.scopeType === "COMPANY") return { scopeType: "COMPANY", scopeId: null, scopeKey: "COMPANY", label: SCOPE_LABELS.COMPANY };
  const id = input.scopeId;
  const missing = () => new ValidationError(`Choose an existing ${SCOPE_LABELS[input.scopeType].toLowerCase()}.`, [{ path: "scopeId", message: "Choose where this role applies" }]);
  if (!id) throw missing();
  let node: { name: string; isActive: boolean; parent?: string | null } | null = null;
  switch (input.scopeType) {
    case "BUSINESS_UNIT":
      node = await db.businessUnit.findUnique({ where: { id }, select: { name: true, isActive: true } });
      break;
    case "SITE":
      node = await db.site.findUnique({ where: { id }, select: { name: true, isActive: true } });
      break;
    case "LOCATION": {
      const l = await db.location.findUnique({ where: { id }, select: { name: true, isActive: true, site: { select: { name: true } } } });
      node = l && { name: l.name, isActive: l.isActive, parent: l.site.name };
      break;
    }
    case "DEPARTMENT": {
      const d = await db.department.findUnique({ where: { id }, select: { name: true, isActive: true, location: { select: { name: true } } } });
      node = d && { name: d.name, isActive: d.isActive, parent: d.location.name };
      break;
    }
  }
  if (!node) throw missing();
  if (!node.isActive) throw new ValidationError(`"${node.name}" is inactive.`, [{ path: "scopeId", message: "Choose an active location in the structure" }]);
  const ref = { type: input.scopeType, id };
  return { scopeType: input.scopeType, scopeId: id, scopeKey: scopeKey(ref), label: formatScopeLabel(input.scopeType, node.name, node.parent) };
}

/** Batch label lookup for assignment lists (one query per level). */
export async function scopeLabels(db: DbClient, refs: { scopeType: ScopeTypeKey; scopeId: string | null }[]): Promise<Map<string, string>> {
  const ids = (type: ScopeTypeKey) => [...new Set(refs.filter((r) => r.scopeType === type && r.scopeId).map((r) => r.scopeId!))];
  const [bus, sites, locations, departments] = await Promise.all([
    ids("BUSINESS_UNIT").length ? db.businessUnit.findMany({ where: { id: { in: ids("BUSINESS_UNIT") } }, select: { id: true, name: true } }) : [],
    ids("SITE").length ? db.site.findMany({ where: { id: { in: ids("SITE") } }, select: { id: true, name: true } }) : [],
    ids("LOCATION").length
      ? db.location.findMany({ where: { id: { in: ids("LOCATION") } }, select: { id: true, name: true, site: { select: { name: true } } } })
      : [],
    ids("DEPARTMENT").length
      ? db.department.findMany({ where: { id: { in: ids("DEPARTMENT") } }, select: { id: true, name: true, location: { select: { name: true } } } })
      : [],
  ]);
  const labels = new Map<string, string>();
  labels.set("COMPANY", SCOPE_LABELS.COMPANY);
  for (const b of bus) labels.set(`BUSINESS_UNIT:${b.id}`, formatScopeLabel("BUSINESS_UNIT", b.name));
  for (const s of sites) labels.set(`SITE:${s.id}`, formatScopeLabel("SITE", s.name));
  for (const l of locations) labels.set(`LOCATION:${l.id}`, formatScopeLabel("LOCATION", l.name, l.site.name));
  for (const d of departments) labels.set(`DEPARTMENT:${d.id}`, formatScopeLabel("DEPARTMENT", d.name, d.location.name));
  for (const r of refs) {
    const key = scopeKey({ type: r.scopeType, id: r.scopeId });
    if (!labels.has(key)) labels.set(key, formatScopeLabel(r.scopeType, null));
  }
  return labels;
}
