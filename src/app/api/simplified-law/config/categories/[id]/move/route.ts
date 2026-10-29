import { PERMISSIONS } from "@/lib/permissions";
import { moveSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** POST /api/simplified-law/config/categories/:id/move – one place up or down among its siblings. */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: moveSchema }, async ({ params, body }) => slawConfigService.moveCategory(params.id!, body.direction));
