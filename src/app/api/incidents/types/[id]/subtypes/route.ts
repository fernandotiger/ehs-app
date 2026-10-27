import { PERMISSIONS } from "@/lib/permissions";
import { subtypeInputSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentTypeService } from "@/server/modules/incidents/incident-type.service";

/** POST /api/incidents/types/:id/subtypes – add a subtype under the type. */
export const POST = apiHandler({ module: "incidents", permission: PERMISSIONS.INCIDENT_CONFIGURE, body: subtypeInputSchema }, async ({ params, body, user, meta }) =>
  incidentTypeService.addSubtype(params.id!, body.name, user, meta),
);
