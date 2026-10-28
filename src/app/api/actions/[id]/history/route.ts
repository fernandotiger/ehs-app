import { z } from "zod";
import { apiHandler } from "@/server/http/api-handler";
import { actionQueryService } from "@/server/modules/actions/action-query.service";

const query = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });

/** GET /api/actions/:id/history – signed audit trail of the action. */
export const GET = apiHandler({ module: "actions", query }, async ({ params, query, user }) => actionQueryService.history(user, params.id!, query.page, query.pageSize));
