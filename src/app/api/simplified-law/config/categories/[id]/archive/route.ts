import { PERMISSIONS } from "@/lib/permissions";
import { archiveSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** POST /api/simplified-law/config/categories/:id/archive – archive an empty category or restore it. */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: archiveSchema }, async ({ params, body, user, meta }) => slawConfigService.archiveCategory(params.id!, body.archived, user, meta));
