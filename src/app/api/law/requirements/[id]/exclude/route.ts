import { lawExcludeSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawRequirementService } from "@/server/modules/law/requirement.service";

/** POST /api/law/requirements/:id/exclude – "does not apply to us", with a reason (earlier work is kept). */
export const POST = apiHandler({ module: "law", body: lawExcludeSchema }, async ({ params, body, user, meta }) => lawRequirementService.exclude(params.id!, body, user, meta));
