import { actionCompleteSchema } from "@/lib/validation/actions";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/actions/action.service";

/** POST /api/actions/:id/complete – what was done + date (owner, or a manager on the owner's behalf). */
export const POST = apiHandler({ module: "actions", body: actionCompleteSchema }, async ({ params, body, user, meta }) => actionService.complete(params.id!, body, user, meta));
