import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type DbClient } from "@/server/db/client";
import { notificationService, type NotifyInput } from "@/server/modules/notifications/notification.service";
import {
  overdueCreatedBefore,
  progressPercent,
  requiredSince,
  resolveAckSettings,
  type AckSettingDefaults,
  type EffectiveAckSettings,
} from "./acknowledgement-rules";
import { audiencePopulationWhere, audienceRowSelect } from "./document-access.policy";
import type { ComplianceStats } from "./document.dto";

/**
 * Everything needed to evaluate a document's acknowledgement requirement against the
 * user directory in SQL: required population, acknowledged/outstanding filters, due dates.
 */
export const requirementSelect = {
  id: true,
  title: true,
  status: true,
  publishedAt: true,
  requiresAcknowledgement: true,
  ackRequiredFromVersion: true,
  ackEnabledAt: true,
  ackDueDays: true,
  reminderIntervalDays: true,
  escalationDays: true,
  escalationTarget: true,
  audiences: { select: audienceRowSelect },
  versions: { select: { versionNumber: true, createdAt: true } },
} satisfies Prisma.DocumentSelect;

export type RequirementDocument = Prisma.DocumentGetPayload<{ select: typeof requirementSelect }>;

export interface Requirement {
  documentId: string;
  /** Acknowledgements of versions >= this number count. */
  fromVersion: number;
  settings: EffectiveAckSettings;
  /** When the current obligation started (null = not published yet). */
  since: Date | null;
  population: Prisma.UserWhereInput;
  acknowledged: Prisma.UserWhereInput;
  outstanding: Prisma.UserWhereInput;
}

export function buildRequirement(doc: RequirementDocument, defaults: AckSettingDefaults): Requirement {
  const fromVersion = doc.ackRequiredFromVersion ?? 1;
  const requiredVersion = doc.versions.find((v) => v.versionNumber === fromVersion) ?? null;
  const ackFilter: Prisma.DocumentAcknowledgementWhereInput = { documentId: doc.id, versionNumber: { gte: fromVersion } };
  return {
    documentId: doc.id,
    fromVersion,
    settings: resolveAckSettings(doc, defaults),
    since: requiredSince(doc.publishedAt, requiredVersion?.createdAt ?? null, doc.ackEnabledAt),
    population: audiencePopulationWhere(doc.audiences),
    acknowledged: { documentAcknowledgements: { some: ackFilter } },
    outstanding: { documentAcknowledgements: { none: ackFilter } },
  };
}

/** Where-clause for users who are overdue (outstanding and past their due date). */
export function overdueWhere(req: Requirement, now: Date): Prisma.UserWhereInput | null {
  const cutoff = overdueCreatedBefore(req.since, req.settings.ackDueDays, now);
  if (!cutoff) return null;
  return { AND: [req.population, req.outstanding, { createdAt: { lt: cutoff } }] };
}

/** "143 required / 127 acknowledged / 16 outstanding" – three COUNT queries, no rows loaded. */
export async function computeComplianceStats(doc: RequirementDocument, defaults: AckSettingDefaults, now: Date, db: DbClient = prisma): Promise<ComplianceStats> {
  const req = buildRequirement(doc, defaults);
  const overdue = overdueWhere(req, now);
  const [required, acknowledged, overdueCount] = await Promise.all([
    db.user.count({ where: req.population }),
    db.user.count({ where: { AND: [req.population, req.acknowledged] } }),
    overdue ? db.user.count({ where: overdue }) : Promise.resolve(0),
  ]);
  return {
    required,
    acknowledged,
    outstanding: Math.max(0, required - acknowledged),
    overdue: doc.status === "PUBLISHED" ? overdueCount : 0,
    percent: progressPercent(acknowledged, required),
    requiredVersionNumber: doc.requiresAcknowledgement ? req.fromVersion : null,
    requiredSince: req.since?.toISOString() ?? null,
    ackDueDays: req.settings.ackDueDays,
  };
}

const ID_BATCH = 1000;

/** Iterate user ids matching `where` in keyset-paginated batches (never loads the whole directory). */
export async function forEachUserIdBatch(where: Prisma.UserWhereInput, fn: (ids: string[]) => Promise<void>, db: DbClient = prisma): Promise<number> {
  let cursor: string | undefined;
  let total = 0;
  for (;;) {
    const rows = await db.user.findMany({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
      take: ID_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    await fn(rows.map((r) => r.id));
    total += rows.length;
    if (rows.length < ID_BATCH) break;
    cursor = rows[rows.length - 1]!.id;
  }
  return total;
}

/** Sends one in-app notification to every user matching `where`, batch by batch. */
export async function notifyUsers(where: Prisma.UserWhereInput, input: Omit<NotifyInput, "userIds">): Promise<number> {
  return forEachUserIdBatch(where, async (ids) => {
    await notificationService.notify({ ...input, userIds: ids });
  });
}

export function documentLink(documentId: string): string {
  return `/documents/${documentId}`;
}
