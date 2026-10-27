import { closeIncidentSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentService } from "@/server/modules/incidents/incident.service";

/** POST /api/incidents/:id/close – explicit closure with a note; 422 { details.blockers } when a gate is not met. */
export const POST = apiHandler({ module: "incidents", body: closeIncidentSchema }, async ({ params, body, user, meta }) =>
  incidentService.close(params.id!, body.note, body.expectedVersion, user, meta),
);
