import { PERMISSIONS } from "@/lib/permissions";
import { riskRulesSchema } from "@/lib/validation/forms";
import { apiHandler } from "@/server/http/api-handler";
import { formService } from "@/server/modules/forms/form.service";

const P = PERMISSIONS;

/** PUT /api/forms/:id/risk-rules – { settings, expectedVersion }; publishes a new version when the form is published. */
export const PUT = apiHandler({ permission: [P.FORMS_DESIGN, P.FORMS_PUBLISH, P.RISK_CONFIGURE], body: riskRulesSchema }, async ({ params, body, user, meta }) =>
  formService.saveRiskRules(params.id!, body, user, meta),
);
