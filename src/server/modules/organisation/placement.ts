import "server-only";
import type { Placement } from "@/lib/scope";
import { prisma, type DbClient } from "@/server/db/client";
import { ValidationError } from "@/server/http/errors";

export interface ResolvedPlacement {
  businessUnitId: string | null;
  siteId: string | null;
  locationId: string | null;
  departmentId: string | null;
}

const EMPTY: ResolvedPlacement = { businessUnitId: null, siteId: null, locationId: null, departmentId: null };

/**
 * Turn the most specific structure id the user picked into a full placement
 * (department → location → site → business unit). Every id is looked up through the
 * tenant-scoped client, so an id from another company is rejected as invalid.
 * Store all four columns on "placed" records so scopeWhere()/canAt() work.
 */
export async function resolvePlacement(input: Placement, db: DbClient = prisma): Promise<ResolvedPlacement> {
  if (input.departmentId) {
    const d = await db.department.findUnique({ where: { id: input.departmentId } });
    if (!d) throw new ValidationError("Unknown department");
    return { businessUnitId: d.businessUnitId, siteId: d.siteId, locationId: d.locationId, departmentId: d.id };
  }
  if (input.locationId) {
    const l = await db.location.findUnique({ where: { id: input.locationId } });
    if (!l) throw new ValidationError("Unknown location");
    return { businessUnitId: l.businessUnitId, siteId: l.siteId, locationId: l.id, departmentId: null };
  }
  if (input.siteId) {
    const s = await db.site.findUnique({ where: { id: input.siteId } });
    if (!s) throw new ValidationError("Unknown site");
    return { businessUnitId: s.businessUnitId, siteId: s.id, locationId: null, departmentId: null };
  }
  if (input.businessUnitId) {
    const b = await db.businessUnit.findUnique({ where: { id: input.businessUnitId } });
    if (!b) throw new ValidationError("Unknown business unit");
    return { ...EMPTY, businessUnitId: b.id };
  }
  return EMPTY;
}
