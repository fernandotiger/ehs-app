import { lawOtherUpdateSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";
import { lawRequirementService } from "@/server/modules/law/requirement.service";

/** GET /api/law/requirements/:id – requirement text, evaluation, next step and rights. */
export const GET = apiHandler({ module: "law" }, async ({ params, user }) => lawQueryService.requirement(user, params.id!));

/** PUT /api/law/requirements/:id – edit a company requirement (legal content comes from the library). */
export const PUT = apiHandler({ module: "law", body: lawOtherUpdateSchema }, async ({ params, body, user, meta }) => lawRequirementService.updateOther(params.id!, body, user, meta));
