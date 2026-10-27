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

const body = z.object({ value: z.unknown(), expectedVersion: z.number().int().min(1) });

/** GET /api/configuration/settings/:key/versioned – { value, version } for editing forms. */
export const GET = apiHandler({}, async ({ params }) => settingsService.getVersioned(keyOf(params)));

/** PUT /api/configuration/settings/:key/versioned – { value, expectedVersion } → 409 STALE_VERSION when someone saved first. */
export const PUT = apiHandler({ body }, async ({ params, body, user, meta }) => {
  const key = keyOf(params);
  requirePermission(user, SETTINGS[key].permission);
  return settingsService.updateVersioned(key, body.value, user, meta, body.expectedVersion);
});
