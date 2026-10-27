import { fileQuerySchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { documentFileService } from "@/server/modules/documents/document-file.service";

/**
 * GET /api/documents/:id/versions/:versionId/file[?download=1]
 * Inline preview by default (PDF/images), attachment with ?download=1. Every access is audited.
 * The service worker caches this exact path pattern for offline reading.
 */
export const GET = apiHandler({ module: "documents", query: fileQuerySchema }, async ({ params, query, user, meta }) =>
  documentFileService.stream(user, params.id!, params.versionId!, { download: query.download === "1" }, meta),
);
