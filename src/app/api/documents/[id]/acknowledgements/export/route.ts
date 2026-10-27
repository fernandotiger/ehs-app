import { ackExportQuerySchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { complianceService } from "@/server/modules/documents/compliance.service";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

/** GET /api/documents/:id/acknowledgements/export?status=acknowledged|outstanding – CSV audit trail download. */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.REPORTS, query: ackExportQuerySchema }, async ({ params, query, user, meta }) =>
  complianceService.exportCsv(params.id!, query, user, meta),
);
