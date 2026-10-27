import { createSurveyDocumentSchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentService } from "@/server/modules/documents/document.service";

/** POST /api/documents/surveys – Survey page: survey + file + audiences + acknowledgement settings (no document details). */
export const POST = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE, body: createSurveyDocumentSchema }, async ({ body, user, meta }) =>
  documentService.createSurvey(body, user, meta),
);
