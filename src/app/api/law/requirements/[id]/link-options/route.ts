import { lawLinkOptionsQuerySchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawConnectionService } from "@/server/modules/law/connections.service";

/** GET /api/law/requirements/:id/link-options?targetType&q – records of the profile's site the caller may open. */
export const GET = apiHandler({ module: "law", query: lawLinkOptionsQuerySchema }, async ({ params, query, user }) => lawConnectionService.linkOptions(user, params.id!, query.targetType, query.q));
