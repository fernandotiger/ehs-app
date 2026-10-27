import { followUpCreateSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";

/** POST /api/incidents/actions/:id/follow-ups – follow-up of an ineffective action (keeps incidents and origin). */
export const POST = apiHandler({ module: "incidents", body: followUpCreateSchema }, async ({ params, body, user, meta }) => actionService.followUp(params.id!, body, user, meta));
