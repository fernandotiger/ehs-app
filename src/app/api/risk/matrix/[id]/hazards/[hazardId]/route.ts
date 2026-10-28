import { PERMISSIONS } from "@/lib/permissions";
import { hazardOptionUpdateSchema } from "@/lib/risk/hazard-options";
import { apiHandler } from "@/server/http/api-handler";
import { riskHazardOptionService } from "@/server/modules/risk/hazard-options.service";

const permission = [PERMISSIONS.RISK_CONFIGURE, PERMISSIONS.FORMS_PUBLISH];

/** PUT /api/risk/matrix/:formId/hazards/:hazardId – rename and/or switch on/off. */
export const PUT = apiHandler({ module: "risk", permission, body: hazardOptionUpdateSchema }, async ({ params, body, user, meta }) =>
  riskHazardOptionService.update(user, params.id!, params.hazardId!, body, meta),
);

/** DELETE /api/risk/matrix/:formId/hazards/:hazardId – remove from the list (assessments keep the name). */
export const DELETE = apiHandler({ module: "risk", permission }, async ({ params, user, meta }) => {
  await riskHazardOptionService.remove(user, params.id!, params.hazardId!, meta);
  return { ok: true };
});
