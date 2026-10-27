import { PERMISSIONS } from "@/lib/permissions";
import { programmeCreateSchema, strategyListQuerySchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { strategyService } from "@/server/modules/risk/strategy.service";

/** GET /api/risk/programmes – list (risk.view scope OR owner). */
export const GET = apiHandler({ module: "risk", query: strategyListQuerySchema }, async ({ query, user }) => strategyService.listProgrammes(user, query));

/** POST /api/risk/programmes – create (422 lists what is missing). */
export const POST = apiHandler({ module: "risk", permission: PERMISSIONS.RISK_CREATE, body: programmeCreateSchema }, async ({ body, user, meta }) => strategyService.createProgramme(body, user, meta));
