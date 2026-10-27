import { versionOnlySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { investigationService } from "@/server/modules/incidents/investigation.service";

/** POST /api/incidents/:id/investigation/reopen – reopen a completed investigation (history kept). */
export const POST = apiHandler({ module: "incidents", body: versionOnlySchema }, async ({ params, body, user, meta }) =>
  investigationService.reopen(params.id!, body.expectedVersion, user, meta),
);
