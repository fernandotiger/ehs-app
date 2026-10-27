import { actionReviewSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";

/** POST /api/incidents/actions/:id/review – Effective / Ineffective on or after the planned date, with a comment. */
export const POST = apiHandler({ module: "incidents", body: actionReviewSchema }, async ({ params, body, user, meta }) => actionService.review(params.id!, body, user, meta));
