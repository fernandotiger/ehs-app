import { apiHandler } from "@/server/http/api-handler";
import { slawActionQueryService } from "@/server/modules/simplified-law/action-query.service";

/** GET /api/simplified-law/actions/:requirementId – one action with its requirement (owner or register users). */
export const GET = apiHandler({ module: "simplified-law" }, async ({ params, user }) => slawActionQueryService.one(user, params.id!));
