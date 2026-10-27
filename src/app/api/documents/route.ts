import { createDocumentSchema, libraryQuerySchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentQueryService } from "@/server/modules/documents/document-query.service";
import { documentService } from "@/server/modules/documents/document.service";

/** GET /api/documents – Document Library (`type=document`, default) or Survey Library (`type=survey`) with compliance counts. */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.LIBRARY, query: libraryQuerySchema }, async ({ query, user }) =>
  documentQueryService.library(query, user),
);

/** POST /api/documents – upload a document (metadata + audiences + acknowledgement settings + uploadId). */
export const POST = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE, body: createDocumentSchema }, async ({ body, user, meta }) =>
  documentService.create(body, user, meta),
);
