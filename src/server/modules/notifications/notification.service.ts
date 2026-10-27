import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type DbClient } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import { resolveTenantId, TenantContextError } from "@/server/tenancy/context";

/** One line of a digest notification. */
export interface NotificationItem {
  title: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  dueDate?: string;
}

export interface NotifyInput {
  userIds: string[];
  /** Free-form type key, e.g. "document.assigned", "incident.assigned", "jobs.digest". */
  type: string;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  items?: NotificationItem[];
  /**
   * Prevents duplicate deliveries. Stored per recipient as `<dedupeKey>:<userId>`, so the same
   * key can be sent to many people but never twice to the same person.
   */
  dedupeKey?: string;
  /** Complete per-recipient dedupe key (overrides `dedupeKey`), e.g. scheduled jobs' `job:<id>:<entity>:<user>:<date>`. */
  dedupeKeyFor?: (userId: string) => string;
}

export interface DigestUpsertInput {
  userId: string;
  type: string;
  /** Complete dedupe key of the recipient's digest (one per job, user and local day). */
  dedupeKey: string;
  link?: string;
  /**
   * Builds the digest from the items already delivered (null when none yet). Return null to leave
   * an existing digest unchanged.
   */
  build: (existing: NotificationItem[] | null) => { title: string; body?: string; items: NotificationItem[] } | null;
}

const BATCH_SIZE = 1000;

/**
 * In-app notifications. `notify` is the single entry point every module uses, so
 * additional channels (email, push) can later be added here as observers.
 */
export const notificationService = {
  /** Returns the number of notifications actually created (duplicates are skipped). */
  async notify(input: NotifyInput, db: DbClient = prisma): Promise<number> {
    const organizationId = await resolveTenantId();
    if (!organizationId) throw new TenantContextError("Notification", "createMany");
    const unique = [...new Set(input.userIds.filter(Boolean))];
    const items = input.items ? (JSON.parse(JSON.stringify(input.items)) as Prisma.InputJsonValue) : undefined;
    let created = 0;
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const result = await db.notification.createMany({
        data: unique.slice(i, i + BATCH_SIZE).map((userId) => ({
          organizationId,
          userId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          items,
          dedupeKey: input.dedupeKeyFor ? input.dedupeKeyFor(userId) : input.dedupeKey ? `${input.dedupeKey}:${userId}` : null,
        })),
        skipDuplicates: true,
      });
      created += result.count;
    }
    return created;
  },

  /**
   * Grouped message per recipient and key: created once, later runs only add new items (the
   * message becomes unread again). Returns what happened.
   */
  async upsertDigest(input: DigestUpsertInput, db: DbClient = prisma): Promise<"created" | "updated" | "unchanged"> {
    const organizationId = await resolveTenantId();
    if (!organizationId) throw new TenantContextError("Notification", "upsert");
    const existing = await db.notification.findFirst({ where: { dedupeKey: input.dedupeKey }, select: { id: true, items: true } });
    const next = input.build(existing ? ((existing.items as NotificationItem[] | null) ?? []) : null);
    if (!next) return "unchanged";
    const items = JSON.parse(JSON.stringify(next.items)) as Prisma.InputJsonValue;
    if (existing) {
      await db.notification.update({ where: { id: existing.id }, data: { title: next.title, body: next.body ?? null, items, readAt: null } });
      return "updated";
    }
    const created = await db.notification.createMany({
      data: [{ organizationId, userId: input.userId, type: input.type, title: next.title, body: next.body ?? null, link: input.link ?? null, items, dedupeKey: input.dedupeKey }],
      skipDuplicates: true,
    });
    return created.count ? "created" : "unchanged";
  },

  /** The bell: latest messages for the signed-in user. */
  async list(userId: string, opts: { unreadOnly?: boolean; limit?: number; cursor?: string }) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const items = await prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });
    return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null, unreadCount };
  },

  async markRead(userId: string, id: string) {
    const result = await prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await prisma.notification.count({ where: { id, userId } });
      if (!exists) throw new NotFoundError();
    }
  },

  async markAllRead(userId: string) {
    await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  },
};
