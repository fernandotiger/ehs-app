import "server-only";
import { Prisma, type RecordLink } from "@/generated/prisma/client";
import type { LinkedRecordDto, LinkedRecordsDto } from "@/lib/validation/evidence";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import { requireEntityAccess, describeEntity } from "@/server/modules/entities/registry";
import { requireTenantId } from "@/server/tenancy/context";

/** Where a follow-up comes from. `sourceKey` narrows it to e.g. one question ("" = whole record). */
export interface LinkSource {
  sourceType: string;
  sourceId: string;
  sourceKey?: string;
  /** What the follow-up is, e.g. "incident", "corrective-action", "risk-task". */
  kind: string;
}

export interface LinkTarget {
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonObject;
}

export interface EnsureResult {
  link: RecordLink;
  /** false when an existing follow-up was returned (idempotent routing). */
  created: boolean;
}

function uniqueWhere(organizationId: string, source: LinkSource) {
  return {
    organizationId_sourceType_sourceId_sourceKey_kind: {
      organizationId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceKey: source.sourceKey ?? "",
      kind: source.kind,
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Idempotent cross-module routing ("raise an action from this audit question"): the first call
 * creates the target record and a RecordLink; every later call for the same
 * (source, sourceKey, kind) returns the existing link instead of creating a duplicate.
 */
export const recordLinkService = {
  /**
   * Inside the caller's transaction: serialises concurrent routing for the same source with a
   * transaction-scoped advisory lock, then returns the existing link or runs `createTarget`
   * and records the link. Both commit (or roll back) with the caller's transaction.
   */
  async ensure(tx: DbClient, source: LinkSource, createTarget: (tx: DbClient) => Promise<LinkTarget>, actorId?: string): Promise<EnsureResult> {
    const organizationId = requireTenantId();
    const lockKey = [organizationId, source.sourceType, source.sourceId, source.sourceKey ?? "", source.kind].join("|");
    // Waits for any other transaction routing the same source; after it commits, the lookup below sees its link.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const existing = await tx.recordLink.findUnique({ where: uniqueWhere(organizationId, source) });
    if (existing) return { link: existing, created: false };

    const target = await createTarget(tx);
    const link = await tx.recordLink.create({
      data: {
        organizationId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        sourceKey: source.sourceKey ?? "",
        kind: source.kind,
        targetType: target.targetType,
        targetId: target.targetId,
        metadata: target.metadata,
        createdById: actorId ?? null,
      },
    });
    return { link, created: true };
  },

  /**
   * Same as `ensure`, in its own transaction. If a writer that does not take the lock wins the
   * unique key first, the whole attempt (including the new target) rolls back and the winner's
   * link is returned.
   */
  async ensureAtomic(source: LinkSource, createTarget: (tx: DbClient) => Promise<LinkTarget>, actorId?: string): Promise<EnsureResult> {
    try {
      return await prisma.$transaction((tx) => this.ensure(tx, source, createTarget, actorId));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await prisma.recordLink.findUnique({ where: uniqueWhere(requireTenantId(), source) });
      if (!winner) throw error;
      return { link: winner, created: false };
    }
  },

  async findForSource(source: LinkSource, db: DbClient = prisma): Promise<RecordLink | null> {
    return db.recordLink.findUnique({ where: uniqueWhere(requireTenantId(), source) });
  },

  /** Follow-ups raised from a record, with label/href (only those the user may open). */
  async listForSource(user: CurrentUser, sourceType: string, sourceId: string): Promise<LinkedRecordDto[]> {
    const rows = await prisma.recordLink.findMany({ where: { sourceType, sourceId }, orderBy: { createdAt: "asc" } });
    return describe(user, rows.map((r) => ({ row: r, entityType: r.targetType, entityId: r.targetId })));
  },

  /** Records a record was raised from (provenance), with label/href. */
  async listForTarget(user: CurrentUser, targetType: string, targetId: string): Promise<LinkedRecordDto[]> {
    const rows = await prisma.recordLink.findMany({ where: { targetType, targetId }, orderBy: { createdAt: "asc" } });
    return describe(user, rows.map((r) => ({ row: r, entityType: r.sourceType, entityId: r.sourceId })));
  },

  /** Both directions for <LinkedRecords/>; the record itself must be visible to the user. */
  async linked(user: CurrentUser, entityType: string, entityId: string): Promise<LinkedRecordsDto> {
    await requireEntityAccess(user, entityType, entityId, "view");
    const [outgoing, incoming] = await Promise.all([this.listForSource(user, entityType, entityId), this.listForTarget(user, entityType, entityId)]);
    return { outgoing, incoming };
  },
};

async function describe(user: CurrentUser, items: { row: RecordLink; entityType: string; entityId: string }[]): Promise<LinkedRecordDto[]> {
  const out: LinkedRecordDto[] = [];
  for (const item of items) {
    const summary = await describeEntity(user, item.entityType, item.entityId);
    if (!summary) continue;
    out.push({
      id: item.row.id,
      kind: item.row.kind,
      entityType: item.entityType,
      entityId: item.entityId,
      label: summary.label,
      href: summary.href,
      createdAt: item.row.createdAt.toISOString(),
    });
  }
  return out;
}
