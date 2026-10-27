import { actionLinkSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";

/** POST /api/incidents/actions/:id/unlink – remove one incident association explicitly. */
export const POST = apiHandler({ module: "incidents", body: actionLinkSchema }, async ({ params, body, user, meta }) => actionService.unlink(params.id!, body.incidentId, user, meta));
