import { incidentExportQuerySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { incidentQueryService } from "@/server/modules/incidents/incident-query.service";

/** GET /api/incidents/export – CSV of the filtered register in the configured column order. */
export const GET = apiHandler({ module: "incidents", query: incidentExportQuerySchema }, async ({ query, user }) => incidentQueryService.exportCsv(user, query));
