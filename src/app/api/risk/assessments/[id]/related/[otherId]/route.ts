import { apiHandler } from "@/server/http/api-handler";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** DELETE /api/risk/assessments/:id/related/:otherId – remove a related-assessment link. */
export const DELETE = apiHandler({ module: "risk" }, async ({ params, user, meta }) => assessmentService.unlink(params.id!, params.otherId!, user, meta));
