import { z } from "zod";
import { isSettingKey, SETTINGS } from "@/lib/settings/registry";
import { requirePermission } from "@/server/auth/authorization";
import { apiHandler } from "@/server/http/api-handler";
import { NotFoundError } from "@/server/http/errors";
import { settingsService } from "@/server/modules/settings/settings.service";

function keyOf(params: Record<string, string>) {
  const key = params.key ?? "";
  if (!isSettingKey(key)) throw new NotFoundError("Unknown setting");
  return key;
}

/** GET /api/configuration/settings/:key – any registered setting (src/lib/settings/registry.ts). */
export const GET = apiHandler({}, async ({ params }) => settingsService.get(keyOf(params)));

/** PUT /api/configuration/settings/:key – validated by the registry schema; needs that setting's permission. */
export const PUT = apiHandler({ body: z.unknown() }, async ({ params, body, user, meta }) => {
  const key = keyOf(params);
  requirePermission(user, SETTINGS[key].permission);
  return settingsService.update(key, body, user, meta);
});
