import { actionCreateSchema, actionListQuerySchema } from "@/lib/validation/actions";
import { apiHandler } from "@/server/http/api-handler";
import { actionQueryService } from "@/server/modules/actions/action-query.service";
import { actionService } from "@/server/modules/actions/action.service";

/** GET /api/actions – My Actions (assigned to me / created by me) or every action I may see (`view=all`). */
export const GET = apiHandler({ module: "actions", query: actionListQuerySchema }, async ({ query, user }) => actionQueryService.list(user, query));

/** POST /api/actions – standalone action (+ extra questions of a published Actions form); idempotent on clientId. */
export const POST = apiHandler({ module: "actions", body: actionCreateSchema }, async ({ body, user, meta }) => actionService.create(body, user, meta));
