import { apiHandler } from "@/server/http/api-handler";
import { actionQueryService } from "@/server/modules/actions/action-query.service";

/** GET /api/actions/summary – counts for the My Actions banner and the Home widget. */
export const GET = apiHandler({ module: "actions" }, async ({ user }) => actionQueryService.summary(user));
