import { ackReportQuerySchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { complianceService } from "@/server/modules/documents/compliance.service";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

/** GET /api/documents/:id/acknowledgements?status=acknowledged|outstanding|overdue&q&departmentId&locationId&page */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.REPORTS, query: ackReportQuerySchema }, async ({ params, query }) =>
  complianceService.report(params.id!, query),
);
