import { PERMISSIONS } from "@/lib/permissions";
import { categoryCreateSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** POST /api/simplified-law/config/categories – new category, or a sub-category when parentId is given. */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: categoryCreateSchema }, async ({ body, user, meta }) => slawConfigService.createCategory(body, user, meta));
