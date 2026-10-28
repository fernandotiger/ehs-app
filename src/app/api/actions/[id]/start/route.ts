import { actionVersionSchema } from "@/lib/validation/actions";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/actions/action.service";

/** POST /api/actions/:id/start – To do → In progress (owner or manager). */
export const POST = apiHandler({ module: "actions", body: actionVersionSchema }, async ({ params, body, user, meta }) => actionService.start(params.id!, body.expectedVersion, user, meta));
