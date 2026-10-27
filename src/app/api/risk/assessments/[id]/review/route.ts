import { periodicReviewSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** POST /api/risk/assessments/:id/review – periodic review (Approved only; no rescoring, no revision change). */
export const POST = apiHandler({ module: "risk", body: periodicReviewSchema }, async ({ params, body, user, meta }) => assessmentService.review(params.id!, body, user, meta));
