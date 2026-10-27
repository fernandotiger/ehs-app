import { actionLinkSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";

/** POST /api/incidents/actions/:id/link – link this existing action to another incident (one shared action). */
export const POST = apiHandler({ module: "incidents", body: actionLinkSchema }, async ({ params, body, user, meta }) => actionService.link(params.id!, body.incidentId, user, meta));
