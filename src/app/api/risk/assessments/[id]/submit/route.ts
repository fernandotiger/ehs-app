import { riskVersionSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** POST /api/risk/assessments/:id/submit – submit a Draft for approval (422 lists what is missing). */
export const POST = apiHandler({ module: "risk", body: riskVersionSchema }, async ({ params, body, user, meta }) => assessmentService.submit(params.id!, body.expectedVersion, user, meta));
