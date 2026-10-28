import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { asChanges, jurisdictionsOf, validatePackage, type LawContentChange, type LawPackage } from "@/lib/law";
import { sampleLawPackage } from "@/lib/law/sample-content";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ConflictError, ForbiddenError } from "@/server/http/errors";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { requireTenantId } from "@/server/tenancy/context";
import { canInstallContent } from "./law-access.policy";
import { blocked, CONTENT_ENTITY, dateOnly, json, LAW_AUDIT, latestVersion, loadVersions, profileHref } from "./support";

/**
 * Legal content library (Configuration → Law content & settings): installed quarterly versions,
 * package preview and installation. Installing NEVER changes a profile – each profile keeps its
 * accepted version until someone accepts the update into it (profile.service.ts).
 */

export interface LawContentVersionDto {
  version: string;
  releasedOn: string;
  summary: string;
  installedAt: string;
  changes: LawContentChange[];
  legislationCount: number;
  checklistCount: number;
}

export interface LawLibraryDto {
  versions: LawContentVersionDto[];
  latest: string | null;
  jurisdictions: string[];
  canInstall: boolean;
}

export type LawPackagePreviewDto =
  | { ok: true; version: string; released: string; summary: string; changes: LawContentChange[]; replaces: string | null }
  | { ok: false; problems: string[] };

export const lawContentService = {
  async library(user: CurrentUser): Promise<LawLibraryDto> {
    const versions = await loadVersions(prisma);
    const latest = latestVersion(versions);
    return {
      versions: versions
        .map((v) => ({
          version: v.version,
          releasedOn: dateOnly(v.releasedOn)!,
          summary: v.summary,
          installedAt: v.installedAt.toISOString(),
          changes: asChanges(v.changes),
          legislationCount: v.content.legislation.length,
          checklistCount: v.content.checklists.length,
        }))
        .reverse(),
      latest: latest?.version ?? null,
      jurisdictions: latest ? jurisdictionsOf(latest.content) : [],
      canInstall: canInstallContent(user),
    };
  },

  /** The fictional sample update offered on the settings page (a downloadable package). */
  sample(): LawPackage {
    return sampleLawPackage();
  },

  /** Validates a package against the installed library and lists its New / Amended items. Installs nothing. */
  async preview(user: CurrentUser, raw: unknown): Promise<LawPackagePreviewDto> {
    if (!canInstallContent(user)) throw new ForbiddenError("Installing legal content needs the Manage requirements permission for the whole company.");
    const latest = latestVersion(await loadVersions(prisma));
    const check = validatePackage(raw, latest ? { version: latest.version, content: latest.content } : null);
    if (!check.ok) return check;
    return { ok: true, version: check.pkg.version, released: check.pkg.released, summary: check.pkg.summary, changes: check.changes, replaces: latest?.version ?? null };
  },

  /** Installs a valid package as the new library version (all or nothing). Profile owners are told an update is available. */
  async install(user: CurrentUser, raw: unknown, meta: RequestMeta): Promise<{ version: string; changes: number }> {
    if (!canInstallContent(user)) throw new ForbiddenError("Installing legal content needs the Manage requirements permission for the whole company.");
    const organizationId = requireTenantId();
    try {
      return await prisma.$transaction(async (tx) => {
        // Serialise installs: the version check below must see any install that committed first.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`law-content|${organizationId}`}, 0))`;
        const latest = latestVersion(await loadVersions(tx));
        const check = validatePackage(raw, latest ? { version: latest.version, content: latest.content } : null);
        if (!check.ok) blocked("The package was not installed", check.problems);
        const row = await tx.lawContentVersion.create({
          data: {
            organizationId,
            version: check.pkg.version,
            rank: check.rank,
            releasedOn: new Date(`${check.pkg.released}T00:00:00.000Z`),
            summary: check.pkg.summary,
            content: json(check.next),
            changes: json(check.changes),
            installedById: user.id,
          },
          select: { id: true },
        });
        await recordAudit(
          {
            entityType: CONTENT_ENTITY,
            entityId: row.id,
            action: LAW_AUDIT.CONTENT_INSTALLED,
            actor: user,
            changes: { version: { from: latest?.version ?? null, to: check.pkg.version } },
            metadata: { summary: check.pkg.summary, new: check.changes.filter((c) => c.change === "NEW").length, amended: check.changes.filter((c) => c.change === "AMENDED").length },
            meta,
          },
          tx,
        );
        const profiles = await tx.lawProfile.findMany({ where: { archivedAt: null }, select: { id: true, name: true, ownerId: true } });
        for (const p of profiles) {
          if (p.ownerId === user.id) continue;
          await notificationService.notify(
            {
              userIds: [p.ownerId],
              type: "law.update-available",
              title: `Legal content ${check.pkg.version} is available for ${p.name}`,
              body: "Review the changes and accept them into the profile when you are ready.",
              link: profileHref(p.id),
              entityType: "LawProfile",
              entityId: p.id,
              dedupeKey: `law.update-available:${p.id}:${check.pkg.version}`,
            },
            tx,
          );
        }
        return { version: check.pkg.version, changes: check.changes.length };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError("This package has already been installed.");
      throw error;
    }
  },
};
