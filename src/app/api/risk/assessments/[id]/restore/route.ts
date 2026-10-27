import { riskVersionSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** POST /api/risk/assessments/:id/restore – restore an archived assessment as Draft. */
export const POST = apiHandler({ module: "risk", body: riskVersionSchema }, async ({ params, body, user, meta }) => assessmentService.restore(params.id!, body.expectedVersion, user, meta));
