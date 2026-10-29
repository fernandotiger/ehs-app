import { requirementAssessSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawAssessmentService } from "@/server/modules/simplified-law/assessment.service";

/** PUT /api/simplified-law/requirements/:id – compliant? reason, and the action when not compliant (expectedVersion). */
export const PUT = apiHandler({ module: "simplified-law", body: requirementAssessSchema }, async ({ params, body, user, meta }) => slawAssessmentService.assessRequirement(params.id!, body, user, meta));
