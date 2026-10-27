import { PERMISSIONS } from "@/lib/permissions";
import { incidentTypeUpdateSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentTypeService } from "@/server/modules/incidents/incident-type.service";

/** PATCH /api/incidents/types/:id – name, settings and form bindings (Configure incidents, company scope). */
export const PATCH = apiHandler({ module: "incidents", permission: PERMISSIONS.INCIDENT_CONFIGURE, body: incidentTypeUpdateSchema }, async ({ params, body, user, meta }) =>
  incidentTypeService.update(params.id!, body, user, meta),
);
