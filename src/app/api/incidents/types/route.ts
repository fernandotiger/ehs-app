import { z } from "zod";
import { PERMISSIONS } from "@/lib/permissions";
import { incidentTypeCreateSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentTypeService } from "@/server/modules/incidents/incident-type.service";

const query = z.object({ includeInactive: z.enum(["true", "false"]).optional() });

/** GET /api/incidents/types – incident types with settings, form bindings and subtypes. */
export const GET = apiHandler({ module: "incidents", query }, async ({ query }) => incidentTypeService.list({ includeInactive: query.includeInactive === "true" }));

/** POST /api/incidents/types – add a tenant's own type (Configure incidents, company scope). */
export const POST = apiHandler({ module: "incidents", permission: PERMISSIONS.INCIDENT_CONFIGURE, body: incidentTypeCreateSchema }, async ({ body, user, meta }) =>
  incidentTypeService.create(body, user, meta),
);
