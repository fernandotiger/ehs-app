import { surveyAnswerSchema } from "@/lib/validation/document-surveys";
import { apiHandler } from "@/server/http/api-handler";
import { surveyService } from "@/server/modules/documents/survey.service";

/** POST /api/documents/:id/survey/answer – send answers (final; a repeat returns the existing participation). */
export const POST = apiHandler({ module: "documents", body: surveyAnswerSchema }, async ({ params, body, user, meta }) => surveyService.answer(params.id!, body, user, meta));
