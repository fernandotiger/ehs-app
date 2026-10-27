import "server-only";
import { counterKey, defaultNumberFormat, formatReference } from "@/lib/settings/numbering";
import type { DbClient } from "@/server/db/client";
import { settingsService } from "@/server/modules/settings/settings.service";
import { requireTenantId } from "@/server/tenancy/context";

/**
 * Per-tenant reference numbers (INC-2026-0001). The format comes from the "numbering" setting;
 * the sequence is an atomic `INSERT … ON CONFLICT DO UPDATE` on `counters`, so concurrent
 * requests never get the same number. Call inside the transaction that creates the record so a
 * rolled-back create also rolls back the number.
 */
export const numberingService = {
  async next(tx: DbClient, key: string, now: Date = new Date()): Promise<string> {
    const organizationId = requireTenantId();
    const settings = await settingsService.get("numbering", tx);
    const format = settings[key] ?? defaultNumberFormat(key);
    const year = now.getUTCFullYear();
    const rowKey = counterKey(key, format, year);
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "counters" ("organizationId", "key", "value") VALUES (${organizationId}, ${rowKey}, 1)
      ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = "counters"."value" + 1
      RETURNING "value"`;
    return formatReference(format, year, Number(rows[0]!.value));
  },
};
