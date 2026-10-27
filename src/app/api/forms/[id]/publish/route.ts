import { PERMISSIONS } from "@/lib/permissions";
import { formPublishSchema } from "@/lib/validation/forms";
import { apiHandler } from "@/server/http/api-handler";
import { formService } from "@/server/modules/forms/form.service";

/** POST /api/forms/:id/publish – { expectedVersion, name?, fields?, settings? } → new immutable version (422 with every rule broken). */
export const POST = apiHandler({ permission: PERMISSIONS.FORMS_PUBLISH, body: formPublishSchema }, async ({ params, body, user, meta }) =>
  formService.publish(params.id!, body, user, meta),
);
