import { actionExportQuerySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionQueryService } from "@/server/modules/incidents/action-query.service";

/** GET /api/incidents/actions/export – CSV of the filtered action register. */
export const GET = apiHandler({ module: "incidents", query: actionExportQuerySchema }, async ({ query, user }) => actionQueryService.exportCsv(user, query));
