import { surveyUpsertSchema } from "@/lib/validation/document-surveys";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { surveyService } from "@/server/modules/documents/survey.service";

/** GET /api/documents/:id/survey – current survey (with lock state) and previous surveys, for the manage page. */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.LIBRARY }, async ({ params }) => surveyService.manageView(params.id!));

/** PUT /api/documents/:id/survey – edit the survey (expectedVersion). New surveys come from POST /api/documents/surveys. */
export const PUT = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE, body: surveyUpsertSchema }, async ({ params, body, user, meta }) =>
  surveyService.update(params.id!, body, user, meta),
);
