import { actionCompleteSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawAssessmentService } from "@/server/modules/simplified-law/assessment.service";

/** POST /api/simplified-law/actions/:requirementId/complete – what was done (owner, or an assessor on their behalf). */
export const POST = apiHandler({ module: "simplified-law", body: actionCompleteSchema }, async ({ params, body, user, meta }) => slawAssessmentService.completeAction(params.id!, body, user, meta));
