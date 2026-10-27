import { actionCreateSchema, actionListQuerySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";
import { actionQueryService } from "@/server/modules/incidents/action-query.service";

/** GET /api/incidents/actions – action register (scope, owner/reviewer/task owner, linked incidents). */
export const GET = apiHandler({ module: "incidents", query: actionListQuerySchema }, async ({ query, user }) => actionQueryService.list(user, query));

/** POST /api/incidents/actions – corrective/preventive action (a corrective action needs at least one incident). */
export const POST = apiHandler({ module: "incidents", body: actionCreateSchema }, async ({ body, user, meta }) => actionService.create(body, user, meta));
