import { actionCompleteSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";

/** POST /api/incidents/actions/:id/complete – → Awaiting effectiveness (all tasks done, comment, reviewer, review date). */
export const POST = apiHandler({ module: "incidents", body: actionCompleteSchema }, async ({ params, body, user, meta }) => actionService.complete(params.id!, body, user, meta));
