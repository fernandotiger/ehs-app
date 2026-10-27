import { apiHandler } from "@/server/http/api-handler";
import { surveyService } from "@/server/modules/documents/survey.service";

/** GET /api/documents/:id/survey/mine – the reader's view of the current survey ({ survey: null } when none). */
export const GET = apiHandler({ module: "documents" }, async ({ params, user }) => surveyService.mine(params.id!, user));
