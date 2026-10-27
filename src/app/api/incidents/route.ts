import { PERMISSIONS } from "@/lib/permissions";
import { incidentCreateSchema, incidentListQuerySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentQueryService } from "@/server/modules/incidents/incident-query.service";
import { incidentService } from "@/server/modules/incidents/incident.service";

/** GET /api/incidents – register (scope, own reports and assignments; search incl. searchable answers). */
export const GET = apiHandler({ module: "incidents", query: incidentListQuerySchema }, async ({ query, user }) => incidentQueryService.list(user, query));

/** POST /api/incidents – report an incident (draft or submit). Idempotent on clientId. */
export const POST = apiHandler({ module: "incidents", permission: PERMISSIONS.INCIDENT_CREATE, body: incidentCreateSchema }, async ({ body, user, meta }) =>
  incidentService.create(body, user, meta),
);
