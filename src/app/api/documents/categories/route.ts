import { apiHandler } from "@/server/http/api-handler";
import { documentService } from "@/server/modules/documents/document.service";

/** GET /api/documents/categories – category list for filters and the upload form. */
export const GET = apiHandler({ module: "documents" }, async () => documentService.categories());
