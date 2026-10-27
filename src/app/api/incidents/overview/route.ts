import { apiHandler } from "@/server/http/api-handler";
import { incidentQueryService } from "@/server/modules/incidents/incident-query.service";

/** GET /api/incidents/overview – KPI counts, needs attention, recent reports and up to four charts. */
export const GET = apiHandler({ module: "incidents" }, async ({ user }) => incidentQueryService.overview(user));
