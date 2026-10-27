import { versionOnlySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentService } from "@/server/modules/incidents/incident.service";

/** POST /api/incidents/:id/submit – submit a draft (422 lists what is missing). */
export const POST = apiHandler({ module: "incidents", body: versionOnlySchema }, async ({ params, body, user, meta }) =>
  incidentService.submit(params.id!, body.expectedVersion, user, meta),
);
