import { surveyTextAnswersQuerySchema } from "@/lib/validation/document-surveys";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { surveyService } from "@/server/modules/documents/survey.service";

/** GET /api/documents/:id/survey/results/text?questionId&surveyId&page – text answers ("Show more"). */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.REPORTS, query: surveyTextAnswersQuerySchema }, async ({ params, query }) =>
  surveyService.textAnswers(params.id!, query),
);
