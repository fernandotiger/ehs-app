import { PERMISSIONS } from "@/lib/permissions";
import { categoryUpdateSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** PUT /api/simplified-law/config/categories/:id – rename / describe. */
export const PUT = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: categoryUpdateSchema }, async ({ params, body, user, meta }) => slawConfigService.updateCategory(params.id!, body, user, meta));
