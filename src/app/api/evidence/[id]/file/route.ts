import { fileQuerySchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { evidenceService } from "@/server/modules/evidence/evidence.service";

/** GET /api/evidence/:id/file[?download=1] – streamed after the owning record's access check. */
export const GET = apiHandler({ query: fileQuerySchema }, async ({ params, query, user }) =>
  evidenceService.streamFile(user, params.id!, { download: query.download === "1" }),
);
