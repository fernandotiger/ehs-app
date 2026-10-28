import { PERMISSIONS } from "@/lib/permissions";
import { hazardOptionCreateSchema } from "@/lib/risk/hazard-options";
import { apiHandler } from "@/server/http/api-handler";
import { riskHazardOptionService } from "@/server/modules/risk/hazard-options.service";

const permission = [PERMISSIONS.RISK_CONFIGURE, PERMISSIONS.FORMS_PUBLISH];

/** GET /api/risk/matrix/:formId/hazards – the form's hazard / aspect options with usage counts. */
export const GET = apiHandler({ module: "risk", permission }, async ({ params, user }) => riskHazardOptionService.list(user, params.id!));

/** POST /api/risk/matrix/:formId/hazards – add an option. */
export const POST = apiHandler({ module: "risk", permission, body: hazardOptionCreateSchema }, async ({ params, body, user, meta }) =>
  riskHazardOptionService.create(user, params.id!, body, meta),
);
