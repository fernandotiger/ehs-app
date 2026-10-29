import { PERMISSIONS } from "@/lib/permissions";
import { archiveSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawConfigService } from "@/server/modules/simplified-law/config.service";

/** POST /api/simplified-law/config/legislation/:id/archive – take a law out of the register, or bring it back. */
export const POST = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: archiveSchema }, async ({ params, body, user, meta }) => slawConfigService.archiveLegislation(params.id!, body.archived, user, meta));
