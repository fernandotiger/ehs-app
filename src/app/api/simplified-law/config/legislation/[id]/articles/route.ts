import { PERMISSIONS } from "@/lib/permissions";
import { articleSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** POST /api/simplified-law/config/legislation/:id/articles – add a overview article (it goes last). */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: articleSchema }, async ({ params, body, user, meta }) => slawConfigService.addArticle(params.id!, body, user, meta));
