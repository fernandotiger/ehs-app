import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { surveyService } from "@/server/modules/documents/survey.service";

/** POST /api/documents/:id/survey/remind – remind people who have not answered a mandatory survey (once a day each). */
export const POST = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.REPORTS }, async ({ params, user, meta }) => surveyService.remind(params.id!, user, meta));
