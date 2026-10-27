import { surveySelectQuerySchema } from "@/lib/validation/document-surveys";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { surveyService } from "@/server/modules/documents/survey.service";

/** GET /api/documents/:id/survey/export?surveyId – CSV of the answers (k-anonymity applied, audited). */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.REPORTS, query: surveySelectQuerySchema }, async ({ params, query, user, meta }) =>
  surveyService.exportCsv(params.id!, query, user, meta),
);
