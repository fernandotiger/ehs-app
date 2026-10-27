import { investigationSaveSchema, startInvestigationSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { investigationService } from "@/server/modules/incidents/investigation.service";

/** POST /api/incidents/:id/investigation – start (captures the Investigation form). */
export const POST = apiHandler({ module: "incidents", body: startInvestigationSchema }, async ({ params, body, user, meta }) =>
  investigationService.start(params.id!, body, user, meta),
);

/** PUT /api/incidents/:id/investigation – save in progress, or complete (`complete: true`, all gates). */
export const PUT = apiHandler({ module: "incidents", body: investigationSaveSchema }, async ({ params, body, user, meta }) =>
  investigationService.save(params.id!, body, user, meta),
);
