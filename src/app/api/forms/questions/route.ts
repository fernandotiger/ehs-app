import { PERMISSIONS } from "@/lib/permissions";
import { reusableQuestionsQuerySchema } from "@/lib/validation/forms";
import { apiHandler } from "@/server/http/api-handler";
import { formService } from "@/server/modules/forms/form.service";

/** GET /api/forms/questions?q&excludeFormId – up to 10 de-duplicated custom questions to reuse. */
export const GET = apiHandler({ permission: PERMISSIONS.FORMS_DESIGN, query: reusableQuestionsQuerySchema }, async ({ query }) =>
  formService.reusableQuestions(query.q, query.excludeFormId),
);
