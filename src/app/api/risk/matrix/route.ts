import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { riskMatrixService } from "@/server/modules/risk/matrix.service";

/** GET /api/risk/matrix – Risk forms with their matrix & review rules (Configuration → Risk). */
export const GET = apiHandler({ module: "risk", permission: [PERMISSIONS.RISK_CONFIGURE, PERMISSIONS.FORMS_PUBLISH] }, async ({ user }) => riskMatrixService.list(user));
