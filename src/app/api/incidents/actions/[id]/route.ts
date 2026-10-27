import { actionUpdateSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";
import { actionQueryService } from "@/server/modules/incidents/action-query.service";

/** GET /api/incidents/actions/:id – action detail: tasks, follow-up tree, incidents, origin, gates. */
export const GET = apiHandler({ module: "incidents" }, async ({ params, user }) => actionQueryService.detail(user, params.id!));

/** PUT /api/incidents/actions/:id – edit the plan (owner, dates, reviewer …) until the effectiveness decision. */
export const PUT = apiHandler({ module: "incidents", body: actionUpdateSchema }, async ({ params, body, user, meta }) => actionService.update(params.id!, body, user, meta));
