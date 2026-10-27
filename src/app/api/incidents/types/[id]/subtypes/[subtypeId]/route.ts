import { PERMISSIONS } from "@/lib/permissions";
import { subtypeUpdateSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentTypeService } from "@/server/modules/incidents/incident-type.service";

/** PATCH /api/incidents/types/:id/subtypes/:subtypeId – rename or (de)activate (one active subtype must remain). */
export const PATCH = apiHandler({ module: "incidents", permission: PERMISSIONS.INCIDENT_CONFIGURE, body: subtypeUpdateSchema }, async ({ params, body, user, meta }) =>
  incidentTypeService.updateSubtype(params.id!, params.subtypeId!, body, user, meta),
);
