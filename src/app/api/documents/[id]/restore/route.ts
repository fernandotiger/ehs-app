import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentService } from "@/server/modules/documents/document.service";

/** POST /api/documents/:id/restore – return an archived document to published (or draft). */
export const POST = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE }, async ({ params, user, meta }) => documentService.restore(params.id!, user, meta));
