import { documentAuditQuerySchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { complianceService } from "@/server/modules/documents/compliance.service";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

/** GET /api/documents/:id/audit – document history from the append-only audit log. */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.REPORTS, query: documentAuditQuerySchema }, async ({ params, query }) =>
  complianceService.history(params.id!, query),
);
