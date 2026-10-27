import { z } from "zod";
import { isPermission } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { userService } from "@/server/modules/users/user.service";

const query = z.object({
  q: z.string().trim().max(100).optional(),
  ids: z.string().optional(),
  permission: z.string().optional().refine((p) => !p || isPermission(p), "Unknown permission"),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** GET /api/lookups/users?q=…&permission=incident.investigate – people picker search. */
export const GET = apiHandler({ query }, async ({ query }) =>
  userService.search(query.q, {
    limit: query.limit,
    ids: query.ids ? query.ids.split(",").filter(Boolean) : undefined,
    permission: query.permission,
  }),
);
