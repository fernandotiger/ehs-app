import { lawLegislationQuerySchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";

/** GET /api/law/legislation?profileId&q&exact&register&category&level – the law library (the profile's accepted version). */
export const GET = apiHandler({ module: "law", query: lawLegislationQuerySchema }, async ({ query, user }) => lawQueryService.legislation(user, query));
