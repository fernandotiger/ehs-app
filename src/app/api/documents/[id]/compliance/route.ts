import { apiHandler } from "@/server/http/api-handler";
import { complianceService } from "@/server/modules/documents/compliance.service";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

/** GET /api/documents/:id/compliance – required / acknowledged / outstanding / overdue counts. */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.REPORTS }, async ({ params }) => complianceService.stats(params.id!));
