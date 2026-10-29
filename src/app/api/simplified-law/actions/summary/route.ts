import { apiHandler } from "@/server/http/api-handler";
import { slawActionQueryService } from "@/server/modules/simplified-law/action-query.service";

/** GET /api/simplified-law/actions/summary – counts for the Actions to do banner. */
export const GET = apiHandler({ module: "simplified-law" }, async ({ user }) => slawActionQueryService.summary(user));
