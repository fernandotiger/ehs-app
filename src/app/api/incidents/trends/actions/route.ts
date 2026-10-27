import { trendActionSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { trendsService } from "@/server/modules/incidents/trends.service";

/** POST /api/incidents/trends/actions – preventive action from selected trend results (snapshot kept on the action). */
export const POST = apiHandler({ module: "incidents", body: trendActionSchema }, async ({ body, user, meta }) => trendsService.createPreventive(user, body, meta));
