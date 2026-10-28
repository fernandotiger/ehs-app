import { lawRaiseIncidentSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawConnectionService } from "@/server/modules/law/connections.service";

/** POST /api/law/requirements/:id/incident – Non Compliance incident draft (one per requirement; repeating returns it). */
export const POST = apiHandler({ module: "law", body: lawRaiseIncidentSchema }, async ({ params, body, user, meta }) => lawConnectionService.raiseIncident(user, params.id!, body, meta));
