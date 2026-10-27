import "server-only";
import type { IncidentStatus } from "@/generated/prisma/client";
import { csvCell, type CsvValue } from "@/server/modules/documents/csv";
import { localDate } from "@/server/modules/jobs/engine";
import type { DbClient } from "@/server/db/client";
import { deriveIncidentStatus, type ActionNode, type IncidentFacts } from "./workflow";

/** Shared helpers for the incident services (names, cached status, dates, CSV). */

export const INCIDENT_ENTITY = "Incident";
export const INVESTIGATION_ENTITY = "Investigation";
export const ACTION_ENTITY = "CorrectiveAction";
export const TASK_ENTITY = "ActionTask";

export const incidentHref = (id: string) => `/incidents/${id}`;
export const actionHref = (id: string) => `/incidents/actions/${id}`;

export interface NamedRef {
  id: string;
  name: string;
}

export interface NameMaps {
  users: Map<string, string>;
  sites: Map<string, string>;
  locations: Map<string, string>;
  departments: Map<string, string>;
}

const uniq = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((v): v is string => Boolean(v)))];

/** Batch-loads display names for users and structure nodes (one query per kind). */
export async function loadNames(
  db: DbClient,
  ids: { users?: (string | null | undefined)[]; sites?: (string | null | undefined)[]; locations?: (string | null | undefined)[]; departments?: (string | null | undefined)[] },
): Promise<NameMaps> {
  const users = uniq(ids.users ?? []);
  const sites = uniq(ids.sites ?? []);
  const locations = uniq(ids.locations ?? []);
  const departments = uniq(ids.departments ?? []);
  const maps: NameMaps = { users: new Map(), sites: new Map(), locations: new Map(), departments: new Map() };
  if (users.length) for (const u of await db.user.findMany({ where: { id: { in: users } }, select: { id: true, name: true } })) maps.users.set(u.id, u.name);
  if (sites.length) for (const s of await db.site.findMany({ where: { id: { in: sites } }, select: { id: true, name: true } })) maps.sites.set(s.id, s.name);
  if (locations.length) for (const l of await db.location.findMany({ where: { id: { in: locations } }, select: { id: true, name: true } })) maps.locations.set(l.id, l.name);
  if (departments.length) {
    for (const d of await db.department.findMany({ where: { id: { in: departments } }, select: { id: true, name: true } })) maps.departments.set(d.id, d.name);
  }
  return maps;
}

export function ref(map: Map<string, string>, id: string | null | undefined): NamedRef | null {
  if (!id) return null;
  return { id, name: map.get(id) ?? "Unknown" };
}

/** "yyyy-mm-dd" of a @db.Date column (or null). */
export function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** "yyyy-mm-dd" → Date at UTC midnight for @db.Date columns. */
export function toDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function todayFor(timeZone: string, now = new Date()): string {
  return localDate(now, timeZone);
}

// ── Derived status cache ────────────────────────────────────────────────────

const factsSelect = {
  id: true,
  isDraft: true,
  closedAt: true,
  status: true,
  investigation: { select: { status: true, actionsRequired: true } },
  actions: { select: { action: { select: { id: true, reference: true, state: true, parentActionId: true, archivedAt: true, incidents: { select: { incidentId: true } } } } } },
} as const;

type FactsRow = {
  isDraft: boolean;
  closedAt: Date | null;
  investigation: { status: "IN_PROGRESS" | "COMPLETED"; actionsRequired: boolean | null } | null;
  actions: { action: { id: string; reference: string; state: ActionNode["state"]; parentActionId: string | null; archivedAt: Date | null; incidents: { incidentId: string }[] } }[];
};

export function toActionNodes(rows: FactsRow["actions"]): ActionNode[] {
  return rows
    .filter((r) => !r.action.archivedAt)
    .map((r) => ({ id: r.action.id, reference: r.action.reference, state: r.action.state, parentActionId: r.action.parentActionId, incidentIds: r.action.incidents.map((i) => i.incidentId) }));
}

export function factsOf(row: FactsRow): IncidentFacts {
  return { isDraft: row.isDraft, closed: Boolean(row.closedAt), investigation: row.investigation, actions: toActionNodes(row.actions) };
}

/** Recomputes the cached `status` of these incidents (call inside the mutating transaction). */
export async function refreshIncidentStatus(db: DbClient, incidentIds: readonly string[]): Promise<void> {
  const ids = uniq([...incidentIds]);
  if (!ids.length) return;
  const rows = await db.incident.findMany({ where: { id: { in: ids } }, select: factsSelect });
  for (const row of rows) {
    const status = deriveIncidentStatus(factsOf(row as unknown as FactsRow)) as IncidentStatus;
    if (status !== row.status) await db.incident.updateMany({ where: { id: row.id }, data: { status } });
  }
}

/** Incidents linked to an action (for status refresh after action changes). */
export async function linkedIncidentIds(db: DbClient, actionId: string): Promise<string[]> {
  const rows = await db.actionIncident.findMany({ where: { actionId }, select: { incidentId: true } });
  return rows.map((r) => r.incidentId);
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function csvResponse(fileName: string, rows: CsvValue[][]): Response {
  const body = `﻿${rows.map((r) => `${r.map(csvCell).join(",")}\r\n`).join("")}`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function csvName(base: string, now = new Date()): string {
  return `${base}-${now.toISOString().slice(0, 10)}.csv`;
}
