import { approveSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** POST /api/risk/assessments/:id/approve – approve: revision + 1 and a retained score/hazard snapshot (owner unchanged). */
export const POST = apiHandler({ module: "risk", body: approveSchema }, async ({ params, body, user, meta }) => assessmentService.approve(params.id!, body, user, meta));
