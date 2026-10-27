import { objectiveUpdateSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { strategyService } from "@/server/modules/risk/strategy.service";

/** GET /api/risk/objectives/:id – detail with its drill-down (404 outside scope). */
export const GET = apiHandler({ module: "risk" }, async ({ params, user }) => strategyService.objective(user, params.id!));

/** PUT /api/risk/objectives/:id – update (expectedVersion). */
export const PUT = apiHandler({ module: "risk", body: objectiveUpdateSchema }, async ({ params, body, user, meta }) => strategyService.updateObjective(params.id!, body, user, meta));
