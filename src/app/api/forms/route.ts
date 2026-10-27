import { PERMISSIONS } from "@/lib/permissions";
import { formCreateSchema, formListQuerySchema } from "@/lib/validation/forms";
import { apiHandler } from "@/server/http/api-handler";
import { formService } from "@/server/modules/forms/form.service";

const P = PERMISSIONS;

/** GET /api/forms?q&module – Form Builder library. */
export const GET = apiHandler({ permission: [P.FORMS_VIEW, P.FORMS_DESIGN, P.FORMS_PUBLISH], query: formListQuerySchema }, async ({ query }) => formService.listLibrary(query));

/** POST /api/forms – { name, module, purpose, domain? } → new draft with the mandatory module questions. */
export const POST = apiHandler({ permission: P.FORMS_DESIGN, body: formCreateSchema }, async ({ body, user, meta }) => formService.create(body, user, meta));
