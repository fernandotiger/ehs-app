import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { applicableChecklists, changedChecklistIds, contentChanges, jurisdictionsOf, type LawContentChange } from "@/lib/law";
import type { LawAcceptInput, LawProfileCreateInput, LawProfileUpdateInput } from "@/lib/validation/law";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ConflictError, ForbiddenError, NotFoundError, StaleVersionError } from "@/server/http/errors";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { numberingService } from "@/server/modules/numbering/numbering.service";
import { resolvePlacement } from "@/server/modules/organisation/placement";
import { requireTenantId } from "@/server/tenancy/context";
import { canEditProfile, canManageLawAt, profileVisibleWhere } from "./law-access.policy";
import { flagChangedRequirements, SAVED_WORK, syncProfileRequirements } from "./requirement-sync";
import { assertActiveUser, blocked, findVersion, isNewer, LAW_AUDIT, latestVersion, loadVersions, placementOf, PROFILE_ENTITY, profileHref, REQUIREMENT_ENTITY, type ContentVersionRow } from "./support";
import { profileBlockers } from "./workflow";

/**
 * Legal profiles: create / edit / archive / restore, and accepting an installed content update
 * into ONE profile. Every change keeps the profile's requirement rows in step with its accepted
 * content (new checklists that apply get a row; nothing is ever deleted). Audited in the same
 * transaction.
 */

const profileSelect = {
  id: true,
  name: true,
  description: true,
  ownerId: true,
  jurisdiction: true,
  activities: true,
  isShared: true,
  showRating: true,
  contentVersion: true,
  version: true,
  archivedAt: true,
  businessUnitId: true,
  siteId: true,
  locationId: true,
  departmentId: true,
} satisfies Prisma.LawProfileSelect;

type ProfileRow = Prisma.LawProfileGetPayload<{ select: typeof profileSelect }>;

export async function loadVisibleProfile(db: DbClient, user: CurrentUser, id: string): Promise<ProfileRow> {
  const row = await db.lawProfile.findFirst({ where: { AND: [{ id }, profileVisibleWhere(user)] }, select: profileSelect });
  if (!row) throw new NotFoundError();
  return row;
}

async function sync(tx: DbClient, user: CurrentUser, profile: ProfileRow, content: ContentVersionRow["content"]) {
  return syncProfileRequirements(tx, {
    organizationId: requireTenantId(),
    profile: { id: profile.id, jurisdiction: profile.jurisdiction, activities: profile.activities, businessUnitId: profile.businessUnitId, siteId: profile.siteId },
    content,
    nextReference: () => numberingService.next(tx, "legal-evaluation"),
    actorId: user.id,
  });
}

function assertJurisdiction(jurisdiction: string, content: ContentVersionRow["content"]) {
  const known = jurisdictionsOf(content);
  if (!known.includes(jurisdiction)) blocked("The profile cannot be saved", [`Choose a jurisdiction the legal content covers (${known.join(", ") || "none installed"}).`]);
}

function uniqueName(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError("Another profile already has this name.");
  throw error;
}

export interface LawUpdatePreviewDto {
  current: string;
  latest: string | null;
  available: boolean;
  summary: string | null;
  changes: LawContentChange[];
  /** Saved evaluations that will be flagged "Law changed – review". */
  flagged: { id: string; reference: string; title: string }[];
  /** Checklists that will start to apply. */
  added: { id: string; title: string }[];
}

export const lawProfileService = {
  async create(input: LawProfileCreateInput, user: CurrentUser, meta: RequestMeta): Promise<{ id: string }> {
    const gates = profileBlockers({ name: input.name, ownerId: input.ownerId, siteId: input.siteId, jurisdiction: input.jurisdiction, activities: input.activities });
    if (gates.length) blocked("The profile cannot be created", gates);
    const latest = latestVersion(await loadVersions(prisma));
    if (!latest) blocked("The profile cannot be created", ["Install the legal content first (Configuration → Law content & settings)."]);
    assertJurisdiction(input.jurisdiction, latest.content);
    const placement = await resolvePlacement({ siteId: input.siteId });
    if (!canManageLawAt(user, placement)) throw new ForbiddenError("You cannot create legal profiles for this site.");
    await assertActiveUser(prisma, input.ownerId!, "the profile owner");
    try {
      return await prisma.$transaction(async (tx) => {
        const profile = await tx.lawProfile.create({
          data: {
            organizationId: requireTenantId(),
            name: input.name.trim(),
            description: input.description,
            ownerId: input.ownerId!,
            jurisdiction: input.jurisdiction,
            activities: input.activities,
            isShared: input.isShared,
            showRating: input.showRating,
            contentVersion: latest.version,
            ...placement,
            createdById: user.id,
          },
          select: profileSelect,
        });
        const { created } = await sync(tx, user, profile, latest.content);
        await recordAudit(
          {
            entityType: PROFILE_ENTITY,
            entityId: profile.id,
            action: LAW_AUDIT.PROFILE_CREATED,
            actor: user,
            changes: { name: profile.name, siteId: profile.siteId, ownerId: profile.ownerId, jurisdiction: profile.jurisdiction, activities: profile.activities, contentVersion: latest.version },
            metadata: { requirements: created.length },
            meta,
          },
          tx,
        );
        if (profile.ownerId !== user.id) {
          await notificationService.notify(
            { userIds: [profile.ownerId], type: "law.profile-owner", title: `You own the legal profile ${profile.name}`, body: `${created.length} requirements to check.`, link: profileHref(profile.id), entityType: PROFILE_ENTITY, entityId: profile.id },
            tx,
          );
        }
        return { id: profile.id };
      });
    } catch (error) {
      return uniqueName(error);
    }
  },

  /** Name, owner, jurisdiction, activities, sharing. Removing an activity keeps the earlier work (it moves "outside this profile"). */
  async update(id: string, input: LawProfileUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleProfile(prisma, user, id);
    if (!canEditProfile(user, row)) throw new ForbiddenError();
    if (row.archivedAt) blocked("The profile cannot be changed", ["Restore the profile first."]);
    if (row.version !== input.expectedVersion) throw new StaleVersionError();
    const gates = profileBlockers({ name: input.name, ownerId: input.ownerId, siteId: row.siteId, jurisdiction: input.jurisdiction, activities: input.activities });
    if (gates.length) blocked("The profile cannot be saved", gates);
    const accepted = findVersion(await loadVersions(prisma), row.contentVersion);
    if (!accepted) throw new NotFoundError();
    if (input.jurisdiction !== row.jurisdiction) assertJurisdiction(input.jurisdiction, accepted.content);
    if (input.ownerId !== row.ownerId) await assertActiveUser(prisma, input.ownerId!, "the profile owner");
    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.lawProfile.updateMany({
          where: { id, version: input.expectedVersion },
          data: {
            name: input.name.trim(),
            description: input.description,
            ownerId: input.ownerId!,
            jurisdiction: input.jurisdiction,
            activities: input.activities,
            isShared: input.isShared,
            showRating: input.showRating,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new StaleVersionError();
        const fresh = await tx.lawProfile.findUniqueOrThrow({ where: { id }, select: profileSelect });
        const { created } = await sync(tx, user, fresh, accepted.content);
        const diff = (key: keyof ProfileRow, before: unknown, after: unknown) => (JSON.stringify(before) !== JSON.stringify(after) ? { [key]: { from: before, to: after } } : {});
        await recordAudit(
          {
            entityType: PROFILE_ENTITY,
            entityId: id,
            action: LAW_AUDIT.PROFILE_UPDATED,
            actor: user,
            changes: {
              ...diff("name", row.name, fresh.name),
              ...diff("description", row.description, fresh.description),
              ...diff("ownerId", row.ownerId, fresh.ownerId),
              ...diff("jurisdiction", row.jurisdiction, fresh.jurisdiction),
              ...diff("activities", row.activities, fresh.activities),
              ...diff("isShared", row.isShared, fresh.isShared),
              ...diff("showRating", row.showRating, fresh.showRating),
            },
            metadata: created.length ? { newRequirements: created.length } : null,
            meta,
          },
          tx,
        );
      });
    } catch (error) {
      uniqueName(error);
    }
  },

  async setArchived(id: string, archived: boolean, expectedVersion: number, user: CurrentUser, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleProfile(prisma, user, id);
    if (!canManageLawAt(user, placementOf(row))) throw new ForbiddenError();
    if (Boolean(row.archivedAt) === archived) return;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.lawProfile.updateMany({ where: { id, version: expectedVersion }, data: { archivedAt: archived ? new Date() : null, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: PROFILE_ENTITY, entityId: id, action: archived ? LAW_AUDIT.PROFILE_ARCHIVED : LAW_AUDIT.PROFILE_RESTORED, actor: user, meta }, tx);
    });
  },

  /** What accepting the latest installed version would change for this profile. */
  async updatePreview(user: CurrentUser, id: string): Promise<LawUpdatePreviewDto> {
    const row = await loadVisibleProfile(prisma, user, id);
    const versions = await loadVersions(prisma);
    const accepted = findVersion(versions, row.contentVersion);
    const latest = latestVersion(versions);
    const empty = { current: row.contentVersion, latest: latest?.version ?? null, available: false, summary: null, changes: [], flagged: [], added: [] };
    if (!accepted || !latest || !isNewer(latest.version, row.contentVersion)) return empty;
    const changedKeys = changedChecklistIds(accepted.content, latest.content);
    const [flagged, existing] = await Promise.all([
      changedKeys.size
        ? prisma.lawRequirement.findMany({ where: { profileId: id, kind: "CONTENT", contentKey: { in: [...changedKeys] }, ...SAVED_WORK }, select: { id: true, reference: true, title: true }, orderBy: { title: "asc" } })
        : [],
      prisma.lawRequirement.findMany({ where: { profileId: id, kind: "CONTENT" }, select: { contentKey: true } }),
    ]);
    const have = new Set(existing.map((r) => r.contentKey));
    const scope = { jurisdiction: row.jurisdiction, activities: row.activities };
    const added = applicableChecklists(latest.content, scope).filter((c) => !have.has(c.id)).map((c) => ({ id: c.id, title: c.title }));
    // Every version between the accepted one and the latest contributes its summary.
    const between = versions.filter((v) => isNewer(v.version, row.contentVersion));
    return {
      current: row.contentVersion,
      latest: latest.version,
      available: true,
      summary: between.map((v) => `${v.version}: ${v.summary}`).join("\n"),
      changes: contentChanges(accepted.content, latest.content),
      flagged,
      added,
    };
  },

  /**
   * Accepts the latest installed version into this profile only. Evaluations, evidence, tasks and
   * links are kept; saved evaluations of changed checklists are flagged for review; checklists that
   * now apply get a row. Accepting the version the profile already uses changes nothing.
   */
  async accept(id: string, input: LawAcceptInput, user: CurrentUser, meta: RequestMeta): Promise<{ changed: boolean; flagged: number; added: number }> {
    const row = await loadVisibleProfile(prisma, user, id);
    if (!canEditProfile(user, row)) throw new ForbiddenError();
    if (row.archivedAt) blocked("The update cannot be accepted", ["Restore the profile first."]);
    if (row.contentVersion === input.version) return { changed: false, flagged: 0, added: 0 };
    const versions = await loadVersions(prisma);
    const latest = latestVersion(versions);
    const accepted = findVersion(versions, row.contentVersion);
    if (!latest || !accepted || latest.version !== input.version || !isNewer(input.version, row.contentVersion)) {
      blocked("The update cannot be accepted", ["Only the latest installed version can be accepted – reload the page."]);
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.lawProfile.updateMany({ where: { id, version: input.expectedVersion, contentVersion: row.contentVersion }, data: { contentVersion: latest.version, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      const flagged = await flagChangedRequirements(tx, { profileId: id, changedKeys: changedChecklistIds(accepted.content, latest.content), version: latest.version });
      for (const f of flagged) {
        await recordAudit(
          { entityType: REQUIREMENT_ENTITY, entityId: f.id, action: LAW_AUDIT.CONTENT_CHANGED, actor: user, changes: { reviewRequired: { from: false, to: true } }, metadata: { version: latest.version }, meta },
          tx,
        );
      }
      const { created } = await sync(tx, user, { ...row, contentVersion: latest.version }, latest.content);
      await recordAudit(
        {
          entityType: PROFILE_ENTITY,
          entityId: id,
          action: LAW_AUDIT.PROFILE_ACCEPTED,
          actor: user,
          changes: { contentVersion: { from: row.contentVersion, to: latest.version } },
          metadata: { flagged: flagged.length, newRequirements: created.length },
          meta,
        },
        tx,
      );
      return { changed: true, flagged: flagged.length, added: created.length };
    });
  },
};
