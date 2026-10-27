import { newVersionSchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentQueryService } from "@/server/modules/documents/document-query.service";
import { documentService } from "@/server/modules/documents/document.service";

/** GET /api/documents/:id/versions – version history. */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.LIBRARY }, async ({ params }) => documentQueryService.versions(params.id!));

/** POST /api/documents/:id/versions – issue a new version (optionally requiring re-acknowledgement). */
export const POST = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE, body: newVersionSchema }, async ({ params, body, user, meta }) =>
  documentService.addVersion(params.id!, body, user, meta),
);
