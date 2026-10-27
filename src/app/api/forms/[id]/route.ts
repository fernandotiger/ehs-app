import { PERMISSIONS } from "@/lib/permissions";
import { formDraftSchema } from "@/lib/validation/forms";
import { apiHandler } from "@/server/http/api-handler";
import { formService } from "@/server/modules/forms/form.service";

const P = PERMISSIONS;

/** GET /api/forms/:id – draft design, settings, versions and what the user may do. */
export const GET = apiHandler({ permission: [P.FORMS_VIEW, P.FORMS_DESIGN, P.FORMS_PUBLISH] }, async ({ params, user }) => formService.get(params.id!, user));

/** PUT /api/forms/:id – save the draft { name?, fields, settings, expectedVersion } (409 STALE_VERSION). */
export const PUT = apiHandler({ permission: P.FORMS_DESIGN, body: formDraftSchema }, async ({ params, body, user, meta }) => formService.saveDraft(params.id!, body, user, meta));
