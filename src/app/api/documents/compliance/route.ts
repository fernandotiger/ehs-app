import { complianceQuerySchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { complianceService } from "@/server/modules/documents/compliance.service";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

/** GET /api/documents/compliance – acknowledgement compliance summary for dashboards. */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.REPORTS, query: complianceQuerySchema }, async ({ query }) =>
  complianceService.summary(query.limit),
);
