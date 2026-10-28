import { tagListQuerySchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { documentTagService } from "@/server/modules/documents/document-tags";

/** GET /api/documents/tags?scope=library|mine – tags for the tag picker and the tag filters. */
export const GET = apiHandler({ module: "documents", query: tagListQuerySchema }, async ({ query, user }) => documentTagService.list(user, query));
