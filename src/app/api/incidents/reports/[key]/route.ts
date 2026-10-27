import { REPORT_KEYS, reportQuerySchema, type ReportKey } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { NotFoundError } from "@/server/http/errors";
import { reportsService } from "@/server/modules/incidents/reports.service";

/** GET /api/incidents/reports/:key?from&to&siteId&format=csv – standard incident reports. */
export const GET = apiHandler({ module: "incidents", query: reportQuerySchema }, async ({ params, query, user }) => {
  const key = params.key as ReportKey;
  if (!(REPORT_KEYS as readonly string[]).includes(key)) throw new NotFoundError("Unknown report");
  return reportsService.run(user, key, query);
});
