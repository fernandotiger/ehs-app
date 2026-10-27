import "server-only";
import type { DbClient } from "@/server/db/client";
import type { ResolvedPlacement } from "./placement";

/**
 * Models that carry the four placement columns (businessUnitId, siteId, locationId,
 * departmentId). Modules add their Prisma delegate name here (e.g. "incident",
 * "riskAssessment") so moving a structure node keeps every placed record consistent.
 */
export const PLACED_MODELS = ["user", "incident", "correctiveAction", "actionTask", "riskAssessment", "riskTask", "riskObjective", "riskProgramme"] as const;

export type PlacedModel = (typeof PLACED_MODELS)[number];

/** Structure levels that can move to a new parent. */
export type MovableLevel = "SITE" | "LOCATION" | "DEPARTMENT";

const NODE_FIELD: Record<MovableLevel, "siteId" | "locationId" | "departmentId"> = {
  SITE: "siteId",
  LOCATION: "locationId",
  DEPARTMENT: "departmentId",
};

/** The ancestors that change when a node of `level` gets a new parent. */
export type NewAncestors<L extends MovableLevel> = L extends "SITE"
  ? Pick<ResolvedPlacement, "businessUnitId">
  : L extends "LOCATION"
    ? Pick<ResolvedPlacement, "businessUnitId" | "siteId">
    : Pick<ResolvedPlacement, "businessUnitId" | "siteId" | "locationId">;

type UpdateManyDelegate = { updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }> };

/**
 * Call inside the transaction that re-parents a structure node (after updating the node itself):
 * rewrites the denormalised ancestor ids of every structure node below it and of every placed
 * record (PLACED_MODELS) that sits at or below it. Returns rows updated per model.
 *
 *   await repositionDescendants(tx, "LOCATION", location.id, { businessUnitId, siteId });
 */
export async function repositionDescendants<L extends MovableLevel>(
  db: DbClient,
  level: L,
  nodeId: string,
  ancestors: NewAncestors<L>,
): Promise<Record<string, number>> {
  const data = { ...ancestors } as Record<string, string | null>;
  const counts: Record<string, number> = {};

  if (level === "SITE") {
    counts.location = (await db.location.updateMany({ where: { siteId: nodeId }, data: { businessUnitId: data.businessUnitId! } })).count;
    counts.department = (await db.department.updateMany({ where: { siteId: nodeId }, data: { businessUnitId: data.businessUnitId! } })).count;
  } else if (level === "LOCATION") {
    counts.department = (
      await db.department.updateMany({ where: { locationId: nodeId }, data: { businessUnitId: data.businessUnitId!, siteId: data.siteId! } })
    ).count;
  }

  const field = NODE_FIELD[level];
  for (const model of PLACED_MODELS) {
    const delegate = (db as unknown as Record<string, UpdateManyDelegate>)[model];
    counts[model] = (await delegate.updateMany({ where: { [field]: nodeId }, data })).count;
  }
  return counts;
}
