import { PERMISSIONS } from "@/lib/permissions";
import { questionSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** POST /api/simplified-law/config/legislation/:id/questions – add a screening question (it goes last). */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: questionSchema }, async ({ params, body, user, meta }) => slawConfigService.addQuestion(params.id!, body, user, meta));
