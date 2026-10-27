import { programmeUpdateSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { strategyService } from "@/server/modules/risk/strategy.service";

/** GET /api/risk/programmes/:id – detail with its drill-down (404 outside scope). */
export const GET = apiHandler({ module: "risk" }, async ({ params, user }) => strategyService.programme(user, params.id!));

/** PUT /api/risk/programmes/:id – update (expectedVersion). */
export const PUT = apiHandler({ module: "risk", body: programmeUpdateSchema }, async ({ params, body, user, meta }) => strategyService.updateProgramme(params.id!, body, user, meta));
