import { actionUpdateSchema } from "@/lib/validation/actions";
import { apiHandler } from "@/server/http/api-handler";
import { actionQueryService } from "@/server/modules/actions/action-query.service";
import { actionService } from "@/server/modules/actions/action.service";

/** GET /api/actions/:id – action with its captured questions, next step and what the caller may do. */
export const GET = apiHandler({ module: "actions" }, async ({ params, user }) => actionQueryService.detail(user, params.id!));

/** PUT /api/actions/:id – edit open work (creator or manager, expectedVersion). */
export const PUT = apiHandler({ module: "actions", body: actionUpdateSchema }, async ({ params, body, user, meta }) => actionService.update(params.id!, body, user, meta));
