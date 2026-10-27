import { riskVersionSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** POST /api/risk/assessments/:id/revise – start a Draft revision of an Approved assessment. */
export const POST = apiHandler({ module: "risk", body: riskVersionSchema }, async ({ params, body, user, meta }) => assessmentService.startRevision(params.id!, body.expectedVersion, user, meta));
