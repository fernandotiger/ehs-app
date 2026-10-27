import { INSIGHTS_PERMISSIONS } from "@/lib/insights";
import { apiHandler } from "@/server/http/api-handler";
import { insightsService } from "@/server/modules/insights/insights.service";

/** GET /api/insights – Home insights: directory, users by role, structure and module record counts. */
export const GET = apiHandler({ permission: INSIGHTS_PERMISSIONS }, async ({ user }) => insightsService.get(user));
