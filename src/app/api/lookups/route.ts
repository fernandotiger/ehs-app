import { apiHandler } from "@/server/http/api-handler";
import { prisma } from "@/server/db/client";

/**
 * GET /api/lookups – company structure and roles every signed-in user may need for forms and
 * filters (with parent ids so pickers can show "Engineering · Production Floor").
 * Cached on the client (and persisted for offline use).
 */
export const GET = apiHandler({}, async () => {
  const active = { isActive: true };
  const [businessUnits, sites, locations, departments, roles] = await Promise.all([
    prisma.businessUnit.findMany({ where: active, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.site.findMany({ where: active, select: { id: true, name: true, businessUnitId: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: active, select: { id: true, name: true, siteId: true, businessUnitId: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({
      where: active,
      select: { id: true, name: true, locationId: true, siteId: true, businessUnitId: true },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({ select: { id: true, name: true, key: true }, orderBy: { name: "asc" } }),
  ]);
  return { businessUnits, sites, locations, departments, roles };
});
