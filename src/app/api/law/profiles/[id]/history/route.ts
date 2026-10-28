import { z } from "zod";
import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";

const query = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });

/** GET /api/law/profiles/:id/history – signed audit trail of the profile. */
export const GET = apiHandler({ module: "law", query }, async ({ params, query, user }) => lawQueryService.profileHistory(user, params.id!, query.page, query.pageSize));
