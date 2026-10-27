import { versionOnlySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentService } from "@/server/modules/incidents/incident.service";

/** POST /api/incidents/:id/archive – hide from the registers (records and history are kept). */
export const POST = apiHandler({ module: "incidents", body: versionOnlySchema }, async ({ params, body, user, meta }) =>
  incidentService.setArchived(params.id!, true, body.expectedVersion, user, meta),
);
