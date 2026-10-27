import { PERMISSIONS } from "@/lib/permissions";
import { targetCreateSchema, strategyListQuerySchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { strategyService } from "@/server/modules/risk/strategy.service";

/** GET /api/risk/targets – list (risk.view scope OR owner). */
export const GET = apiHandler({ module: "risk", query: strategyListQuerySchema }, async ({ query, user }) => strategyService.listTargets(user, query));

/** POST /api/risk/targets – create (422 lists what is missing). */
export const POST = apiHandler({ module: "risk", permission: PERMISSIONS.RISK_CREATE, body: targetCreateSchema }, async ({ body, user, meta }) => strategyService.createTarget(body, user, meta));
