import { assessmentUpdateSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentQueryService } from "@/server/modules/risk/assessment-query.service";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** GET /api/risk/assessments/:id – detail with next step, gates and permissions (404 outside scope). */
export const GET = apiHandler({ module: "risk" }, async ({ params, user }) => assessmentQueryService.detail(user, params.id!));

/** PUT /api/risk/assessments/:id – edit a Draft / Awaiting-approval assessment (expectedVersion; decision draft | submit | approve). */
export const PUT = apiHandler({ module: "risk", body: assessmentUpdateSchema }, async ({ params, body, user, meta }) => assessmentService.update(params.id!, body, user, meta));
