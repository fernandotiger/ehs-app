import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS } from "@/lib/permissions";
import { paginate, paginationQuerySchema } from "@/lib/validation/common";
import { prisma } from "@/server/db/client";
import { apiHandler } from "@/server/http/api-handler";

const query = paginationQuerySchema.extend({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
});

/** GET /api/admin/audit – system-wide, append-only audit log. */
export const GET = apiHandler({ permission: PERMISSIONS.ADMIN_AUDIT, query }, async ({ query }) => {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.q
      ? { OR: [{ action: { contains: query.q, mode: "insensitive" } }, { actorName: { contains: query.q, mode: "insensitive" } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(query) }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
});
