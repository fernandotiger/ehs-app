import { surveyCommandSchema } from "@/lib/validation/document-surveys";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { surveyService } from "@/server/modules/documents/survey.service";

/** POST /api/documents/:id/survey/close – stop accepting answers (results are kept). */
export const POST = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE, body: surveyCommandSchema }, async ({ params, body, user, meta }) =>
  surveyService.setOpen(params.id!, "close", body, user, meta),
);
