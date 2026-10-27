import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentService } from "@/server/modules/documents/document.service";

/** POST /api/documents/:id/archive – hide the document from employees (history is kept). */
export const POST = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE }, async ({ params, user, meta }) => documentService.archive(params.id!, user, meta));
