import { historyQuerySchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentQueryService } from "@/server/modules/risk/assessment-query.service";

/** GET /api/risk/assessments/:id/history – signed audit trail of the assessment. */
export const GET = apiHandler({ module: "risk", query: historyQuerySchema }, async ({ params, query, user }) => assessmentQueryService.history(user, params.id!, query.page, query.pageSize));
