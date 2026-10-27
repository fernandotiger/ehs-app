import { PERMISSIONS } from "@/lib/permissions";
import { RISK_REPORT_KEYS, riskReportQuerySchema, type RiskReportKey } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { NotFoundError } from "@/server/http/errors";
import { riskReportsService } from "@/server/modules/risk/reports.service";

/** GET /api/risk/reports/:key?from&to&siteId&format=csv – Risk reports 1–7 (limited to what the caller can see). */
export const GET = apiHandler({ module: "risk", permission: [PERMISSIONS.RISK_VIEW, PERMISSIONS.RISK_TASK_VIEW], query: riskReportQuerySchema }, async ({ params, query, user }) => {
  const key = params.key as RiskReportKey;
  if (!(RISK_REPORT_KEYS as readonly string[]).includes(key)) throw new NotFoundError("Unknown report");
  return riskReportsService.run(user, key, query);
});
