import { updateDocumentSchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentQueryService } from "@/server/modules/documents/document-query.service";
import { documentService } from "@/server/modules/documents/document.service";

/** GET /api/documents/:id – viewer detail (404 outside the visibility policy). */
export const GET = apiHandler({ module: "documents" }, async ({ params, user }) => documentQueryService.viewerDetail(user, params.id!));

/** PUT /api/documents/:id – edit metadata, audiences and acknowledgement settings. */
export const PUT = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE, body: updateDocumentSchema }, async ({ params, body, user, meta }) =>
  documentService.update(params.id!, body, user, meta),
);
