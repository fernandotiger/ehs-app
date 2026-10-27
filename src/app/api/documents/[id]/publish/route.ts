import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentService } from "@/server/modules/documents/document.service";

/** POST /api/documents/:id/publish – publish a draft and notify its audience. */
export const POST = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE }, async ({ params, user, meta }) => documentService.publish(params.id!, user, meta));
