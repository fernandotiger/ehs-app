import { surveySelectQuerySchema } from "@/lib/validation/document-surveys";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { surveyService } from "@/server/modules/documents/survey.service";

/** GET /api/documents/:id/survey/results?surveyId – summary of the answers (k-anonymity applied). */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.REPORTS, query: surveySelectQuerySchema }, async ({ params, query }) =>
  surveyService.results(params.id!, query),
);
