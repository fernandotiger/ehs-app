import { myDocumentsQuerySchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { documentQueryService } from "@/server/modules/documents/document-query.service";

/** GET /api/documents/my – documents assigned to the signed-in user with acknowledgement status. */
export const GET = apiHandler({ module: "documents", query: myDocumentsQuerySchema }, async ({ query, user }) => documentQueryService.myDocuments(user, query));
