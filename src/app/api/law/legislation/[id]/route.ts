import { lawProfileQuerySchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";

/** GET /api/law/legislation/:id?profileId – synopsis, source, hierarchy, related requirements, risk assessments, change history. */
export const GET = apiHandler({ module: "law", query: lawProfileQuerySchema }, async ({ params, query, user }) => lawQueryService.legislationItem(user, params.id!, query.profileId));
