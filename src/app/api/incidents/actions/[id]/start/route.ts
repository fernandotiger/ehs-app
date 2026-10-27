import { versionOnlySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";

/** POST /api/incidents/actions/:id/start – Open → In progress. */
export const POST = apiHandler({ module: "incidents", body: versionOnlySchema }, async ({ params, body, user, meta }) => actionService.start(params.id!, body.expectedVersion, user, meta));
