import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { resolveSetting, SETTINGS, type SettingDefinition, type SettingKey, type SettingValue } from "@/lib/settings/registry";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { StaleVersionError } from "@/server/http/errors";
import { requireTenantId, resolveTenantId, TenantContextError } from "@/server/tenancy/context";

/**
 * Typed tenant settings (src/lib/settings/registry.ts). Values are JSON documents in
 * `OrgSetting` merged over the registry defaults, so a missing row simply means "defaults".
 */
export const settingsService = {
  async get<K extends SettingKey>(key: K, db: DbClient = prisma): Promise<SettingValue<K>> {
    const organizationId = await resolveTenantId();
    if (!organizationId) throw new TenantContextError("OrgSetting", "findUnique");
    const row = await db.orgSetting.findUnique({ where: { organizationId_key: { organizationId, key } } });
    return resolveSetting(key, row?.value ?? null);
  },

  /** Value plus its optimistic-concurrency version (a missing row is version 1 = defaults). */
  async getVersioned<K extends SettingKey>(key: K): Promise<{ value: SettingValue<K>; version: number }> {
    const organizationId = await resolveTenantId();
    if (!organizationId) throw new TenantContextError("OrgSetting", "findUnique");
    const row = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId, key } } });
    return { value: resolveSetting(key, row?.value ?? null), version: row?.version ?? 1 };
  },

  /**
   * Validates against the registry schema, stores the full value and audits the diff.
   * With `expectedVersion` the save fails with StaleVersionError when someone else saved first.
   */
  async update<K extends SettingKey>(key: K, value: unknown, actor: CurrentUser, meta: RequestMeta, expectedVersion?: number): Promise<SettingValue<K>> {
    return (await this.updateVersioned(key, value, actor, meta, expectedVersion)).value;
  },

  async updateVersioned<K extends SettingKey>(
    key: K,
    value: unknown,
    actor: CurrentUser,
    meta: RequestMeta,
    expectedVersion?: number,
  ): Promise<{ value: SettingValue<K>; version: number }> {
    const definition = SETTINGS[key] as SettingDefinition;
    const next = definition.schema.parse(value) as SettingValue<K>;
    const organizationId = requireTenantId();
    const json = JSON.parse(JSON.stringify(next)) as Prisma.InputJsonValue;
    let version = 1;
    let before: SettingValue<K> | undefined;
    await prisma.$transaction(async (tx) => {
      const row = await tx.orgSetting.findUnique({ where: { organizationId_key: { organizationId, key } } });
      const current = row?.version ?? 1;
      if (expectedVersion !== undefined && expectedVersion !== current) throw new StaleVersionError();
      before = resolveSetting(key, row?.value ?? null);
      if (row) {
        const updated = await tx.orgSetting.updateMany({
          where: { organizationId, key, version: current },
          data: { value: json, updatedById: actor.id, version: { increment: 1 } },
        });
        if (updated.count === 0) throw new StaleVersionError();
      } else {
        await tx.orgSetting.create({ data: { organizationId, key, value: json, updatedById: actor.id, version: current + 1 } });
      }
      version = current + 1;
      await recordAudit(
        {
          entityType: "Setting",
          entityId: key,
          action: "SETTINGS_UPDATED",
          actor,
          changes: diff((before ?? {}) as Record<string, unknown>, next as Record<string, unknown>),
          meta,
        },
        tx,
      );
    });
    return { value: next, version };
  },

  async maxUploadBytes(purpose: "default" | "evidence" = "default"): Promise<number> {
    const system = await this.get("system");
    return (purpose === "evidence" ? system.evidenceMaxUploadMb : system.maxUploadSizeMb) * 1024 * 1024;
  },
};
