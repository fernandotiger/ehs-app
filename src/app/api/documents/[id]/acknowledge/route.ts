import { acknowledgeSchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { acknowledgementService } from "@/server/modules/documents/acknowledgement.service";

/** POST /api/documents/:id/acknowledge – record "I confirm that I have read and understood this document." */
export const POST = apiHandler({ module: "documents", body: acknowledgeSchema }, async ({ params, body, user, meta }) =>
  acknowledgementService.acknowledge(params.id!, { versionId: body.versionId, source: "ONLINE" }, user, meta),
);
