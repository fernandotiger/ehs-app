import { riskVersionSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** POST /api/risk/assessments/:id/archive – archive (nothing is deleted). */
export const POST = apiHandler({ module: "risk", body: riskVersionSchema }, async ({ params, body, user, meta }) => assessmentService.archive(params.id!, body.expectedVersion, user, meta));
