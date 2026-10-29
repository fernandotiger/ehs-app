import { historyQuerySchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawRegisterService } from "@/server/modules/simplified-law/register.service";

/** GET /api/simplified-law/legislation/:id/history – signed audit trail of the law and its requirements. */
export const GET = apiHandler({ module: "simplified-law", query: historyQuerySchema }, async ({ params, query, user }) => slawRegisterService.history(user, params.id!, query.page, query.pageSize));
