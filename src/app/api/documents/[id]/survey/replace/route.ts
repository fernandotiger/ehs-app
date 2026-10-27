import { surveyUpsertSchema } from "@/lib/validation/document-surveys";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { surveyService } from "@/server/modules/documents/survey.service";

/** POST /api/documents/:id/survey/replace – keep the current survey read-only and start a new one. */
export const POST = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE, body: surveyUpsertSchema }, async ({ params, body, user, meta }) =>
  surveyService.replace(params.id!, body, user, meta),
);
