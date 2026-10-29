import { PERMISSIONS } from "@/lib/permissions";
import { questionSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** PUT /api/simplified-law/config/questions/:id – change a screening question. */
export const PUT = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: questionSchema }, async ({ params, body, user, meta }) => slawConfigService.updateQuestion(params.id!, body, user, meta));

/** DELETE /api/simplified-law/config/questions/:id – remove a screening question (audited). */
export const DELETE = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE }, async ({ params, user, meta }) => slawConfigService.removeQuestion(params.id!, user, meta));
