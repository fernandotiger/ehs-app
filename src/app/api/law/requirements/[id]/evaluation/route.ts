import { lawEvaluationSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawRequirementService } from "@/server/modules/law/requirement.service";

/** POST /api/law/requirements/:id/evaluation – save the check (partial saves allowed; explicit review confirmation). */
export const POST = apiHandler({ module: "law", body: lawEvaluationSchema }, async ({ params, body, user, meta }) => lawRequirementService.saveEvaluation(params.id!, body, user, meta));
