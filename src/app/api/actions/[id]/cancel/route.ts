import { actionCancelSchema } from "@/lib/validation/actions";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/actions/action.service";

/** POST /api/actions/:id/cancel – with a reason (creator or manager). */
export const POST = apiHandler({ module: "actions", body: actionCancelSchema }, async ({ params, body, user, meta }) => actionService.cancel(params.id!, body, user, meta));
