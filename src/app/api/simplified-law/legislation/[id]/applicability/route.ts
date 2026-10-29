import { applicabilitySchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawAssessmentService } from "@/server/modules/simplified-law/assessment.service";

/** PUT /api/simplified-law/legislation/:id/applicability – screening answers + "applies / does not apply" (expectedVersion). */
export const PUT = apiHandler({ module: "simplified-law", body: applicabilitySchema }, async ({ params, body, user, meta }) => slawAssessmentService.saveApplicability(params.id!, body, user, meta));
