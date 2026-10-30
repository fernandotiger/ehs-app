import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentQueryService } from "@/server/modules/documents/document-query.service";

/** GET /api/documents/library-summary – the Document Library banner numbers (same access as the library list). */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.LIBRARY }, async () => documentQueryService.librarySummary());
