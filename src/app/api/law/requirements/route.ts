import { lawOtherCreateSchema, lawRequirementListQuerySchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";
import { lawRequirementService } from "@/server/modules/law/requirement.service";

/** GET /api/law/requirements?profileId&view&status&register&category&q – a profile's register ("Laws that apply to us"). */
export const GET = apiHandler({ module: "law", query: lawRequirementListQuerySchema }, async ({ query, user }) => lawQueryService.requirements(user, query));

/** POST /api/law/requirements – company-specific requirement ("other requirement") in a profile. */
export const POST = apiHandler({ module: "law", body: lawOtherCreateSchema }, async ({ body, user, meta }) => lawRequirementService.createOther(body, user, meta));
