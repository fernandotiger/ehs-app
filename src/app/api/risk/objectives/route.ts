import { PERMISSIONS } from "@/lib/permissions";
import { objectiveCreateSchema, strategyListQuerySchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { strategyService } from "@/server/modules/risk/strategy.service";

/** GET /api/risk/objectives – list (risk.view scope OR owner). */
export const GET = apiHandler({ module: "risk", query: strategyListQuerySchema }, async ({ query, user }) => strategyService.listObjectives(user, query));

/** POST /api/risk/objectives – create (422 lists what is missing). */
export const POST = apiHandler({ module: "risk", permission: PERMISSIONS.RISK_CREATE, body: objectiveCreateSchema }, async ({ body, user, meta }) => strategyService.createObjective(body, user, meta));
