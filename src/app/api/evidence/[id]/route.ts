import { apiHandler } from "@/server/http/api-handler";
import { evidenceService } from "@/server/modules/evidence/evidence.service";

/** DELETE /api/evidence/:id – detach (the stored file is kept for the audit trail). */
export const DELETE = apiHandler({}, async ({ params, user, meta }) => {
  await evidenceService.remove(user, params.id!, meta);
});
