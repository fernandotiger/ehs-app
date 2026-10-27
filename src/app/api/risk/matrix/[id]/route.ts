import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { riskMatrixService } from "@/server/modules/risk/matrix.service";

/** GET /api/risk/matrix/:formId – the Risk form whose rules are edited; saving uses PUT /api/forms/:id/risk-rules (Form Builder service). */
export const GET = apiHandler({ module: "risk", permission: [PERMISSIONS.RISK_CONFIGURE, PERMISSIONS.FORMS_PUBLISH] }, async ({ params, user }) => riskMatrixService.form(user, params.id!));
