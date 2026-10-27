import { reopenIncidentSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentService } from "@/server/modules/incidents/incident.service";

/** POST /api/incidents/:id/reopen – reopen a closed incident (the closure stays in the history). */
export const POST = apiHandler({ module: "incidents", body: reopenIncidentSchema }, async ({ params, body, user, meta }) =>
  incidentService.reopen(params.id!, body.reason, body.expectedVersion, user, meta),
);
