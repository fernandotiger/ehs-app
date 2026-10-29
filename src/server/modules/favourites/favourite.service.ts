import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { sameFavourite } from "@/lib/favourites/rules";
import { sanitiseSnapshot, snapshotTooLarge, type Snapshot } from "@/lib/favourites/snapshot";
import { FAVOURITE_LIMIT, type CreateFavouriteData, type MoveFavouriteInput, type UpdateFavouriteData } from "@/lib/validation/favourites";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/server/http/errors";
import type { FavouriteDetail, FavouriteKindKey, FavouriteListItem } from "./favourite.dto";
import { checkPageForFavourite, itemStatus, type PageCheck } from "./favourite-status";

/**
 * Personal favourites (owner-only). Every query filters on `userId: user.id`, so another user's
 * favourite is simply not found; the tenant-scoped client adds the company.
 *
 * Deviations from the platform rules (docs/modules/favourites.md): no audit records (personal
 * settings – an audit entry would show typed text to admins) and hard delete (not a business record).
 */

const listSelect = { id: true, kind: true, title: true, icon: true, color: true, url: true, createdAt: true, updatedAt: true } as const;

type ListRow = Prisma.FavouriteGetPayload<{ select: typeof listSelect }>;

function toItem(row: ListRow, hasSnapshot: boolean, user: CurrentUser): FavouriteListItem {
  const kind = row.kind as FavouriteKindKey;
  return {
    id: row.id,
    kind,
    title: row.title,
    icon: row.icon,
    color: row.color,
    url: row.url,
    hasSnapshot,
    ...itemStatus(kind, row.url, user),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requirePage(check: PageCheck): Extract<PageCheck, { ok: true }> {
  if (!check.ok) throw new BusinessRuleError(check.message);
  return check;
}

/** Sanitised typed details for a route with a `seed` key (null when nothing is left). */
function acceptSnapshot(input: Record<string, unknown> | null | undefined, check: Extract<PageCheck, { ok: true }>): Snapshot | null {
  if (input == null) return null;
  if (!check.entry.seed) throw new ValidationError("Typed details can only be kept for create pages.");
  const snapshot = sanitiseSnapshot(input);
  if (snapshot && snapshotTooLarge(snapshot)) throw new BusinessRuleError("What you typed is too long to keep in a favourite (16 KB at most). Save the page without it.");
  return snapshot;
}

const jsonOrNull = (snapshot: Snapshot | null) => (snapshot ? (snapshot as Prisma.InputJsonValue) : Prisma.DbNull);

async function findOwned(user: CurrentUser, id: string) {
  const row = await prisma.favourite.findFirst({ where: { id, userId: user.id }, select: { ...listSelect, snapshot: true } });
  if (!row) throw new NotFoundError("Favourite not found");
  return row;
}

async function assertNotDuplicate(user: CurrentUser, kind: FavouriteKindKey, url: string, exceptId?: string) {
  const rows = await prisma.favourite.findMany({ where: { userId: user.id, kind, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { url: true } });
  if (rows.some((r) => sameFavourite(r.url, url))) {
    throw new BusinessRuleError(kind === "PAGE" ? "This page is already in your favourites." : "This website is already in your favourites.");
  }
}

export const favouriteService = {
  async list(user: CurrentUser): Promise<FavouriteListItem[]> {
    const [rows, withSnapshot] = await Promise.all([
      prisma.favourite.findMany({ where: { userId: user.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: listSelect }),
      prisma.favourite.findMany({ where: { userId: user.id, snapshot: { not: Prisma.DbNull } }, select: { id: true } }),
    ]);
    const ids = new Set(withSnapshot.map((r) => r.id));
    return rows.map((row) => toItem(row, ids.has(row.id), user));
  },

  async get(user: CurrentUser, id: string): Promise<FavouriteDetail> {
    const row = await findOwned(user, id);
    const snapshot = (row.snapshot ?? null) as Snapshot | null;
    return { ...toItem(row, snapshot !== null, user), snapshot };
  },

  async create(user: CurrentUser, input: CreateFavouriteData): Promise<FavouriteListItem> {
    const count = await prisma.favourite.count({ where: { userId: user.id } });
    if (count >= FAVOURITE_LIMIT) throw new BusinessRuleError(`You can keep up to ${FAVOURITE_LIMIT} favourites – remove one first.`);

    let url = input.url;
    let snapshot: Snapshot | null = null;
    if (input.kind === "PAGE") {
      const check = requirePage(checkPageForFavourite(input.url, user));
      url = check.url;
      snapshot = acceptSnapshot(input.snapshot, check);
    }
    await assertNotDuplicate(user, input.kind, url);

    const last = await prisma.favourite.findFirst({ where: { userId: user.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const row = await prisma.favourite.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        kind: input.kind,
        title: input.title,
        icon: input.icon ?? null,
        color: input.color ?? null,
        url,
        snapshot: jsonOrNull(snapshot),
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: listSelect,
    });
    return toItem(row, snapshot !== null, user);
  },

  async update(user: CurrentUser, id: string, input: UpdateFavouriteData): Promise<FavouriteListItem> {
    const current = await findOwned(user, id);
    const kind = current.kind as FavouriteKindKey;
    const data: Prisma.FavouriteUpdateManyMutationInput = {};
    let hasSnapshot = current.snapshot !== null;

    if (input.title !== undefined) data.title = input.title;
    if (input.icon !== undefined) data.icon = input.icon;
    if (input.color !== undefined) data.color = input.color;
    if (input.url !== undefined) {
      if (kind !== "EXTERNAL") throw new ValidationError("Only a website link's address can be changed.");
      await assertNotDuplicate(user, kind, input.url, id);
      data.url = input.url;
    }
    if (input.replaceUrl !== undefined) {
      if (kind !== "PAGE") throw new ValidationError("Only a page favourite can be updated to the current page.");
      const check = requirePage(checkPageForFavourite(input.replaceUrl, user));
      await assertNotDuplicate(user, kind, check.url, id);
      const snapshot = acceptSnapshot(input.snapshot, check);
      data.url = check.url;
      data.snapshot = jsonOrNull(snapshot);
      hasSnapshot = snapshot !== null;
    }

    const { count } = await prisma.favourite.updateMany({ where: { id, userId: user.id }, data });
    if (!count) throw new NotFoundError("Favourite not found");
    const row = await prisma.favourite.findFirstOrThrow({ where: { id, userId: user.id }, select: listSelect });
    return toItem(row, hasSnapshot, user);
  },

  async remove(user: CurrentUser, id: string): Promise<void> {
    const { count } = await prisma.favourite.deleteMany({ where: { id, userId: user.id } });
    if (!count) throw new NotFoundError("Favourite not found");
  },

  /** Moves one favourite a place earlier ("up") or later ("down") and renumbers the user's list. */
  async move(user: CurrentUser, id: string, { direction }: MoveFavouriteInput): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.favourite.findMany({ where: { userId: user.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, sortOrder: true } });
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) throw new NotFoundError("Favourite not found");
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= rows.length) return;
      const order = rows.map((r) => r.id);
      [order[index], order[target]] = [order[target]!, order[index]!];
      for (const [position, rowId] of order.entries()) {
        if (rows.find((r) => r.id === rowId)?.sortOrder !== position) {
          await tx.favourite.updateMany({ where: { id: rowId, userId: user.id }, data: { sortOrder: position } });
        }
      }
    });
  },
};
