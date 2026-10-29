import { actionListQuerySchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawActionQueryService } from "@/server/modules/simplified-law/action-query.service";

/** GET /api/simplified-law/actions – the action tracker (mine, or everyone's for register users). */
export const GET = apiHandler({ module: "simplified-law", query: actionListQuerySchema }, async ({ query, user }) => slawActionQueryService.list(user, query));
