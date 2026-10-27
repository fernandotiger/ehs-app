import { apiHandler } from "@/server/http/api-handler";
import { assessmentQueryService } from "@/server/modules/risk/assessment-query.service";

/** GET /api/risk/overview – KPI counts, needs attention, recent assessments, programme progress (Home + Overview). */
export const GET = apiHandler({ module: "risk" }, async ({ user }) => assessmentQueryService.overview(user));
