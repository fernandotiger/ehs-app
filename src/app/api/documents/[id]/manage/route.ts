import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentQueryService } from "@/server/modules/documents/document-query.service";

/** GET /api/documents/:id/manage – management detail (audiences, settings, compliance). */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.LIBRARY }, async ({ params }) => documentQueryService.manageDetail(params.id!));
