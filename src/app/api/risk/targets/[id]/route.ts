import { targetUpdateSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { strategyService } from "@/server/modules/risk/strategy.service";

/** GET /api/risk/targets/:id – detail with its drill-down (404 outside scope). */
export const GET = apiHandler({ module: "risk" }, async ({ params, user }) => strategyService.target(user, params.id!));

/** PUT /api/risk/targets/:id – update (expectedVersion). */
export const PUT = apiHandler({ module: "risk", body: targetUpdateSchema }, async ({ params, body, user, meta }) => strategyService.updateTarget(params.id!, body, user, meta));
