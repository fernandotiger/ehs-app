import { mySurveysQuerySchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { documentQueryService } from "@/server/modules/documents/document-query.service";

/** GET /api/documents/surveys/my – My Surveys: surveys assigned to the signed-in user with answer status. */
export const GET = apiHandler({ module: "documents", query: mySurveysQuerySchema }, async ({ query, user }) => documentQueryService.mySurveys(user, query));
