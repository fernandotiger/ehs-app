import { assessmentExportQuerySchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentQueryService } from "@/server/modules/risk/assessment-query.service";

/** GET /api/risk/assessments/export – CSV of the filtered register (formula-leading text escaped). */
export const GET = apiHandler({ module: "risk", query: assessmentExportQuerySchema }, async ({ query, user }) => assessmentQueryService.export(user, query));
