import { PERMISSIONS } from "@/lib/permissions";
import { settingsSchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawSettingsService } from "@/server/modules/simplified-law/settings.service";

/** GET /api/simplified-law/settings – register title, jurisdictions, status wording and defaults. */
export const GET = apiHandler({ module: "simplified-law" }, async () => slawSettingsService.get());

/** PUT /api/simplified-law/settings – Simplified law → Configuration → Settings (expectedVersion; 0 = first save). */
export const PUT = apiHandler({ module: "simplified-law", permission: PERMISSIONS.SLAW_MANAGE, body: settingsSchema }, async ({ body, user, meta }) => slawSettingsService.update(body, user, meta));
