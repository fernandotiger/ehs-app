import { lawProfileQuerySchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";

/** GET /api/law/overview?profileId – the selected profile's figures, "Needs attention" and recent checks. */
export const GET = apiHandler({ module: "law", query: lawProfileQuerySchema }, async ({ query, user }) => lawQueryService.overview(user, query.profileId));
