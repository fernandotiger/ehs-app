import { incidentUpdateSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentQueryService } from "@/server/modules/incidents/incident-query.service";
import { incidentService } from "@/server/modules/incidents/incident.service";

/** GET /api/incidents/:id – detail with derived status, next step, gates and permissions (404 outside scope). */
export const GET = apiHandler({ module: "incidents" }, async ({ params, user }) => incidentQueryService.detail(user, params.id!));

/** PUT /api/incidents/:id – edit the report (expectedVersion; closed reports must be reopened first). */
export const PUT = apiHandler({ module: "incidents", body: incidentUpdateSchema }, async ({ params, body, user, meta }) =>
  incidentService.update(params.id!, body, user, meta),
);
