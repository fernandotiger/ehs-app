import { apiHandler } from "@/server/http/api-handler";
import { incidentTypeService } from "@/server/modules/incidents/incident-type.service";

/** GET /api/incidents/report-setup – active types, subtypes and bound Report form questions (cached for offline reporting). */
export const GET = apiHandler({ module: "incidents" }, async () => incidentTypeService.reportSetup());
