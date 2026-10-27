import { trendCriteriaSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { trendsService } from "@/server/modules/incidents/trends.service";

/** POST /api/incidents/trends – preview matching active submitted incidents with summaries. */
export const POST = apiHandler({ module: "incidents", body: trendCriteriaSchema }, async ({ body, user }) => trendsService.preview(user, body));
