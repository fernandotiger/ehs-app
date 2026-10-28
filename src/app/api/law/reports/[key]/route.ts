import { PERMISSIONS } from "@/lib/permissions";
import { LAW_REPORT_KEYS, lawReportQuerySchema, type LawReportKey } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { NotFoundError } from "@/server/http/errors";
import { lawReportsService } from "@/server/modules/law/reports.service";

/** GET /api/law/reports/:key?profileId&register&category&format=csv – compliance register, task tracking, linked work. */
export const GET = apiHandler({ module: "law", permission: PERMISSIONS.LAW_VIEW, query: lawReportQuerySchema }, async ({ params, query, user }) => {
  const key = params.key as LawReportKey;
  if (!(LAW_REPORT_KEYS as readonly string[]).includes(key)) throw new NotFoundError("Unknown report");
  return lawReportsService.run(user, key, query);
});
