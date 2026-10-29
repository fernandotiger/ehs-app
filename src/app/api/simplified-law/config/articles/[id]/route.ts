import { PERMISSIONS } from "@/lib/permissions";
import { articleSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** PUT /api/simplified-law/config/articles/:id – change a overview article. */
export const PUT = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: articleSchema }, async ({ params, body, user, meta }) => slawConfigService.updateArticle(params.id!, body, user, meta));

/** DELETE /api/simplified-law/config/articles/:id – remove a overview article (audited). */
export const DELETE = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE }, async ({ params, user, meta }) => slawConfigService.removeArticle(params.id!, user, meta));
