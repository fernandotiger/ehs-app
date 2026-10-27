import "server-only";
import { prisma } from "@/server/db/client";

/**
 * User directory reads used by pickers. User administration (create, edit, deactivate,
 * passwords) is rebuilt under Configuration → Users.
 */
export const userService = {
  /** Lightweight directory search for pickers (audience, action owner, investigator…). */
  async search(q: string | undefined, opts: { limit?: number; ids?: string[]; permission?: string } = {}) {
    return prisma.user.findMany({
      where: {
        isActive: true,
        ...(opts.ids?.length ? { id: { in: opts.ids } } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
        ...(opts.permission ? { roleAssignments: { some: { role: { permissions: { has: opts.permission } } } } } : {}),
      },
      select: { id: true, name: true, email: true, jobTitle: true, department: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: Math.min(opts.limit ?? 20, 50),
    });
  },
};
