import { versionOnlySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentService } from "@/server/modules/incidents/incident.service";

/** POST /api/incidents/:id/restore – bring an archived incident back. */
export const POST = apiHandler({ module: "incidents", body: versionOnlySchema }, async ({ params, body, user, meta }) =>
  incidentService.setArchived(params.id!, false, body.expectedVersion, user, meta),
);
