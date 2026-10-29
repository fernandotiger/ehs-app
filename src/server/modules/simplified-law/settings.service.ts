import "server-only";
import { DEFAULT_ACTION_DAYS, DEFAULT_JURISDICTIONS, DEFAULT_REGISTER_TITLE, SLAW_LIMITS, statusLabels } from "@/lib/simplified-law";
import { moveInOrder, nameBlockers } from "@/lib/simplified-law/rules";
import type { SettingsInput } from "@/lib/validation/simplified-law";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { StaleVersionError } from "@/server/http/errors";
import { requireTenantId } from "@/server/tenancy/context";
import type { SlawSettingsDto } from "./slaw.dto";
import { blocked, SLAW_AUDIT, SLAW_SETTINGS_ENTITY } from "./support";

/**
 * Simplified law settings (Simplified law → Configuration → Settings and Jurisdictions). One row per
 * tenant, created on the first save; until then the defaults apply. Renaming a jurisdiction renames it
 * on every law; removing one that laws use is blocked.
 */

const DEFAULTS: SlawSettingsDto = {
  registerTitle: DEFAULT_REGISTER_TITLE,
  jurisdictions: DEFAULT_JURISDICTIONS,
  statusLabels: statusLabels(null),
  hideRepealed: true,
  defaultActionDays: DEFAULT_ACTION_DAYS,
  version: 0,
};

const DEFAULTS_DB = {
  registerTitle: DEFAULTS.registerTitle,
  jurisdictions: DEFAULTS.jurisdictions,
  statusLabels: DEFAULTS.statusLabels,
  hideRepealed: DEFAULTS.hideRepealed,
  defaultActionDays: DEFAULTS.defaultActionDays,
};

async function load(db: DbClient): Promise<SlawSettingsDto> {
  const row = await db.slawSettings.findFirst();
  if (!row) return { ...DEFAULTS, jurisdictions: [...DEFAULTS.jurisdictions] };
  return {
    registerTitle: row.registerTitle,
    jurisdictions: row.jurisdictions,
    statusLabels: statusLabels(row.statusLabels),
    hideRepealed: row.hideRepealed,
    defaultActionDays: row.defaultActionDays,
    version: row.version,
  };
}

/** Writes the settings row (created on first save) after an optimistic version check. */
async function save(db: DbClient, expectedVersion: number, data: Partial<Omit<SlawSettingsDto, "version">>): Promise<void> {
  const organizationId = requireTenantId();
  if (expectedVersion === 0) {
    const exists = await db.slawSettings.findFirst({ select: { id: true } });
    if (exists) throw new StaleVersionError();
    await db.slawSettings.create({ data: { organizationId, ...DEFAULTS_DB, ...data } });
    return;
  }
  const res = await db.slawSettings.updateMany({ where: { version: expectedVersion }, data: { ...data, version: { increment: 1 } } });
  if (res.count === 0) throw new StaleVersionError();
}

async function audit(db: DbClient, user: CurrentUser, changes: Record<string, unknown> | null, meta: RequestMeta) {
  const row = await db.slawSettings.findFirst({ select: { id: true } });
  await recordAudit({ entityType: SLAW_SETTINGS_ENTITY, entityId: row!.id, action: SLAW_AUDIT.SETTINGS_UPDATED, actor: user, changes, meta }, db);
}

export const slawSettingsService = {
  get: (db: DbClient = prisma) => load(db),

  async update(input: SettingsInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const before = await load(tx);
      const data = { registerTitle: input.registerTitle, statusLabels: input.statusLabels, hideRepealed: input.hideRepealed, defaultActionDays: input.defaultActionDays };
      await save(tx, input.expectedVersion, data);
      await audit(tx, user, diff(before as unknown as Record<string, unknown>, data), meta);
    });
  },

  async addJurisdiction(name: string, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const s = await load(tx);
      const gates = nameBlockers(name, s.jurisdictions, "jurisdiction");
      if (s.jurisdictions.length >= SLAW_LIMITS.jurisdictions) gates.push(`Use at most ${SLAW_LIMITS.jurisdictions} jurisdictions.`);
      if (gates.length) blocked("The jurisdiction cannot be added", gates);
      const jurisdictions = [...s.jurisdictions, name.trim()];
      await save(tx, s.version, { jurisdictions });
      await audit(tx, user, { jurisdictions: { from: s.jurisdictions, to: jurisdictions } }, meta);
    });
  },

  /** Renames the jurisdiction in the list and on every law that uses it. */
  async renameJurisdiction(from: string, to: string, user: CurrentUser, meta: RequestMeta): Promise<{ laws: number }> {
    return prisma.$transaction(async (tx) => {
      const s = await load(tx);
      if (!s.jurisdictions.includes(from)) blocked("The jurisdiction cannot be renamed", [`"${from}" is not in the list.`]);
      const gates = nameBlockers(to, s.jurisdictions, "jurisdiction", from);
      if (gates.length) blocked("The jurisdiction cannot be renamed", gates);
      const jurisdictions = s.jurisdictions.map((j) => (j === from ? to.trim() : j));
      await save(tx, s.version, { jurisdictions });
      const laws = await tx.slawLegislation.updateMany({ where: { jurisdiction: from }, data: { jurisdiction: to.trim(), version: { increment: 1 } } });
      await audit(tx, user, { jurisdictions: { from: s.jurisdictions, to: jurisdictions } }, meta);
      return { laws: laws.count };
    });
  },

  async removeJurisdiction(name: string, user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const s = await load(tx);
      const used = await tx.slawLegislation.count({ where: { jurisdiction: name } });
      const gates: string[] = [];
      if (used) gates.push(`${used} law${used === 1 ? " uses" : "s use"} it – change them first or rename the jurisdiction.`);
      if (s.jurisdictions.length <= 1) gates.push("Keep at least one jurisdiction.");
      if (gates.length) blocked("The jurisdiction cannot be removed", gates);
      const jurisdictions = s.jurisdictions.filter((j) => j !== name);
      await save(tx, s.version, { jurisdictions });
      await audit(tx, user, { jurisdictions: { from: s.jurisdictions, to: jurisdictions } }, meta);
    });
  },

  async moveJurisdiction(name: string, direction: "up" | "down", user: CurrentUser, meta: RequestMeta): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const s = await load(tx);
      const jurisdictions = moveInOrder(s.jurisdictions, name, direction);
      if (jurisdictions.join("\n") === s.jurisdictions.join("\n")) return;
      await save(tx, s.version, { jurisdictions });
      await audit(tx, user, { jurisdictions: { from: s.jurisdictions, to: jurisdictions } }, meta);
    });
  },
};
