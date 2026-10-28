import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ACK_NEEDS_FILE, type AudienceInput, type CreateDocumentInput, type CreateSurveyDocumentInput, type NewVersionInput, type UpdateDocumentInput } from "@/lib/validation/documents";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/server/http/errors";
import { uploadService } from "@/server/modules/uploads/upload.service";
import { audiencePopulationWhere, type AudienceRow } from "./document-access.policy";
import { DOCUMENT_AUDIT, DOCUMENT_ENTITY, DOCUMENT_NOTIFICATIONS } from "./document-audit-actions";
import { audienceCreateRows, audienceInputFromRows, audienceRowsFromInput, emptyToNull } from "./document-mappers";
import { documentLink, notifyUsers } from "./document-requirement";
import { setDocumentTags } from "./document-tags";
import type { CategoryDto, CreatedDocumentDto } from "./document.dto";
import { currentSurveyWhere } from "./survey-summary";
import { auditSurveyCreated, createSurveyRows, notifySurveyAudience, notifySurveyOnPublish } from "./survey.service";

/**
 * Document commands (documents.manage): create, edit metadata/audiences/acknowledgement
 * settings, publish, archive/restore and version control. Every mutation writes its audit
 * record in the same transaction; audience notifications are sent after commit in batches.
 */

/** Upload page: always a file. Survey page: the file is optional (`uploadId` null = a survey on its own). */
type NewDocumentInput = Omit<CreateDocumentInput, "uploadId"> & { uploadId: string | null };

function audienceRows(input: AudienceInput): AudienceRow[] {
  return audienceRowsFromInput(input);
}

async function resolveCategoryId(db: DbClient, name: string, organizationId: string): Promise<string | null> {
  const clean = emptyToNull(name);
  if (!clean) return null;
  const existing = await db.documentCategory.findFirst({ where: { name: { equals: clean, mode: "insensitive" } }, select: { id: true } });
  if (existing) return existing.id;
  const created = await db.documentCategory.create({ data: { organizationId, name: clean }, select: { id: true } });
  return created.id;
}

async function assertUniqueIdentity(db: DbClient, input: { title: string; referenceCode: string }, excludeId?: string) {
  const notSelf: Prisma.DocumentWhereInput = excludeId ? { id: { not: excludeId } } : {};
  const clash = await db.document.findFirst({
    where: { ...notSelf, status: { not: "ARCHIVED" }, title: { equals: input.title.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) throw new ConflictError("An active document or survey with this title already exists.");
  const reference = emptyToNull(input.referenceCode);
  if (reference) {
    const refClash = await db.document.findFirst({ where: { ...notSelf, referenceCode: { equals: reference, mode: "insensitive" } }, select: { id: true } });
    if (refClash) throw new ConflictError("Another document already uses this reference code.");
  }
}

/**
 * Reject unknown role/structure/user ids with a 422 instead of a foreign-key failure. Lookups go
 * through the tenant-scoped client, so ids from another company count as unknown.
 */
async function assertAudienceReferences(db: DbClient, audience: AudienceInput) {
  const uniq = (ids: string[]) => [...new Set(ids)];
  const count = (ids: string[], query: (ids: string[]) => Promise<number>) => (ids.length ? query(uniq(ids)) : Promise.resolve(0));
  const [roles, businessUnits, sites, locations, departments, users] = await Promise.all([
    count(audience.roleIds, (ids) => db.role.count({ where: { id: { in: ids } } })),
    count(audience.businessUnitIds, (ids) => db.businessUnit.count({ where: { id: { in: ids } } })),
    count(audience.siteIds, (ids) => db.site.count({ where: { id: { in: ids } } })),
    count(audience.locationIds, (ids) => db.location.count({ where: { id: { in: ids } } })),
    count(audience.departmentIds, (ids) => db.department.count({ where: { id: { in: ids } } })),
    count(audience.userIds, (ids) => db.user.count({ where: { id: { in: ids } } })),
  ]);
  if (
    roles !== uniq(audience.roleIds).length ||
    businessUnits !== uniq(audience.businessUnitIds).length ||
    sites !== uniq(audience.siteIds).length ||
    locations !== uniq(audience.locationIds).length ||
    departments !== uniq(audience.departmentIds).length ||
    users !== uniq(audience.userIds).length
  ) {
    throw new ValidationError("The audience references a role, business unit, site, location, department or person that no longer exists.");
  }
}

function ackData(input: UpdateDocumentInput["ack"]) {
  return {
    requiresAcknowledgement: input.requiresAcknowledgement,
    ackDueDays: input.ackDueDays,
    reminderIntervalDays: input.reminderIntervalDays,
    escalationDays: input.escalationDays,
    escalationTarget: input.escalationTarget,
  };
}

async function notifyAssigned(doc: { id: string; title: string; requiresAcknowledgement: boolean }, audience: AudienceRow[]) {
  return notifyUsers(audiencePopulationWhere(audience), {
    type: DOCUMENT_NOTIFICATIONS.ASSIGNED,
    title: `New document: ${doc.title}`,
    body: doc.requiresAcknowledgement ? "Please read this document and confirm you have understood it." : "A new document is available to you.",
    link: documentLink(doc.id),
    entityType: DOCUMENT_ENTITY,
    entityId: doc.id,
  });
}

async function loadForCommand(id: string) {
  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      audiences: true,
      category: { select: { name: true } },
      currentVersion: { select: { id: true, versionNumber: true } },
    },
  });
  if (!doc) throw new NotFoundError();
  return doc;
}

export const documentService = {
  async categories(): Promise<CategoryDto[]> {
    // Deactivated categories (Configuration → Lists) are no longer offered.
    const rows = await prisma.documentCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, _count: { select: { documents: { where: { status: { not: "ARCHIVED" } } } } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, documentCount: r._count.documents }));
  },

  /** Live "≈ N people" estimate for the audience builder (a single COUNT). */
  async estimateAudience(audience: AudienceInput): Promise<{ count: number }> {
    const count = await prisma.user.count({ where: audiencePopulationWhere(audienceRows(audience)) });
    return { count };
  },

  async create(input: NewDocumentInput, actor: CurrentUser, meta: RequestMeta): Promise<CreatedDocumentDto> {
    const organizationId = actor.organizationId;
    if (!input.uploadId && !input.survey) throw new ValidationError("Choose the document file to upload.");
    if (!input.uploadId && input.ack.requiresAcknowledgement) throw new ValidationError(ACK_NEEDS_FILE);
    const rows = audienceCreateRows(audienceRowsFromInput(input.audience), organizationId);
    const doc = await prisma.$transaction(async (tx) => {
      await assertUniqueIdentity(tx, input);
      await assertAudienceReferences(tx, input.audience);
      const categoryId = await resolveCategoryId(tx, input.categoryName, organizationId);
      const file = input.uploadId ? await uploadService.consume(input.uploadId, actor, "document-version", tx) : null;
      const now = new Date();

      const document = await tx.document.create({
        data: {
          organizationId,
          title: input.title.trim(),
          description: emptyToNull(input.description),
          referenceCode: emptyToNull(input.referenceCode),
          categoryId,
          status: input.publish ? "PUBLISHED" : "DRAFT",
          publishedAt: input.publish ? now : null,
          ...ackData(input.ack),
          ackRequiredFromVersion: input.ack.requiresAcknowledgement ? 1 : null,
          createdById: actor.id,
          audiences: { createMany: { data: rows } },
        },
      });
      if (file) {
        const version = await tx.documentVersion.create({
          data: {
            organizationId,
            documentId: document.id,
            versionNumber: 1,
            fileName: file.fileName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            storageDriver: file.storageDriver,
            storageKey: file.storageKey,
            checksum: file.checksum,
            changeNote: "Initial version",
            uploadedById: actor.id,
            createdAt: now,
          },
        });
        await tx.document.update({ where: { id: document.id }, data: { currentVersionId: version.id } });
      }
      const tags = await setDocumentTags(tx, document.id, input.tags, organizationId);

      await recordAudit(
        {
          entityType: DOCUMENT_ENTITY,
          entityId: document.id,
          action: DOCUMENT_AUDIT.CREATED,
          actor,
          changes: {
            title: document.title,
            referenceCode: document.referenceCode,
            category: emptyToNull(input.categoryName),
            ...(tags.after.length ? { tags: tags.after } : {}),
            audience: input.audience,
            acknowledgement: input.ack,
            file: file ? { versionNumber: 1, fileName: file.fileName, sizeBytes: file.sizeBytes } : null,
          },
          meta,
        },
        tx,
      );
      if (input.publish) {
        await recordAudit({ entityType: DOCUMENT_ENTITY, entityId: document.id, action: DOCUMENT_AUDIT.PUBLISHED, actor, meta }, tx);
      }
      // Optional survey, created in the same transaction (goes live with the document).
      const survey = input.survey ? await createSurveyRows(tx, document.id, input.survey, actor, now) : null;
      if (survey && input.survey) await auditSurveyCreated(tx, document.id, survey.id, input.survey, actor, meta);
      return { ...document, survey };
    });

    const notified = input.publish ? await notifyAssigned(doc, audienceRows(input.audience)) : 0;
    if (input.publish && doc.survey) await notifySurveyAudience({ id: doc.id, title: doc.title, audiences: audienceRows(input.audience) }, doc.survey);
    return { id: doc.id, status: doc.status, notified, surveyId: doc.survey?.id ?? null };
  },

  /**
   * Survey page: a document whose purpose is its survey. No details are asked – the document takes
   * the survey's title and introduction and stays uncategorised (all editable later). The file is
   * optional; without one readers answer straight away and acknowledgement is not available.
   */
  async createSurvey(input: CreateSurveyDocumentInput, actor: CurrentUser, meta: RequestMeta): Promise<CreatedDocumentDto> {
    return documentService.create(
      { ...input, uploadId: input.uploadId ?? null, title: input.survey.title, description: input.survey.intro, referenceCode: "", categoryName: "", tags: [] },
      actor,
      meta,
    );
  },

  async update(id: string, input: UpdateDocumentInput, actor: CurrentUser, meta: RequestMeta) {
    const before = await loadForCommand(id);
    if (before.status === "ARCHIVED") throw new BusinessRuleError("Restore the document before editing it.");

    const beforeAudience = audienceInputFromRows(before.audiences);
    const afterAudience = audienceInputFromRows(audienceRows(input.audience));
    const audienceChanged = JSON.stringify(beforeAudience) !== JSON.stringify(afterAudience);
    const ackTurnedOn = input.ack.requiresAcknowledgement && !before.requiresAcknowledgement;
    if (ackTurnedOn && !before.currentVersion) throw new BusinessRuleError(`${ACK_NEEDS_FILE} Use Versions → Upload new version.`);

    await prisma.$transaction(async (tx) => {
      await assertUniqueIdentity(tx, input, id);
      await assertAudienceReferences(tx, input.audience);
      const categoryId = await resolveCategoryId(tx, input.categoryName, actor.organizationId);

      await tx.document.update({
        where: { id },
        data: {
          title: input.title.trim(),
          description: emptyToNull(input.description),
          referenceCode: emptyToNull(input.referenceCode),
          categoryId,
          ...ackData(input.ack),
          // Switching acknowledgement on restarts the clock, so nobody is overdue immediately.
          ...(ackTurnedOn ? { ackEnabledAt: new Date() } : {}),
          // First time acknowledgement is required: start from the current version.
          ...(input.ack.requiresAcknowledgement && before.ackRequiredFromVersion === null
            ? { ackRequiredFromVersion: before.currentVersion?.versionNumber ?? 1 }
            : {}),
        },
      });
      if (audienceChanged) {
        await tx.documentAudience.deleteMany({ where: { documentId: id } });
        await tx.documentAudience.createMany({
          data: audienceCreateRows(audienceRowsFromInput(input.audience), actor.organizationId).map((r) => ({ ...r, documentId: id })),
        });
      }
      const tags = await setDocumentTags(tx, id, input.tags, actor.organizationId);

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const track = (key: string, from: unknown, to: unknown) => {
        if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) changes[key] = { from: from ?? null, to: to ?? null };
      };
      track("title", before.title, input.title.trim());
      track("description", before.description, emptyToNull(input.description));
      track("referenceCode", before.referenceCode, emptyToNull(input.referenceCode));
      track("category", before.category?.name ?? null, emptyToNull(input.categoryName));
      track("tags", tags.before, tags.after);
      track("requiresAcknowledgement", before.requiresAcknowledgement, input.ack.requiresAcknowledgement);
      track("ackDueDays", before.ackDueDays, input.ack.ackDueDays);
      track("reminderIntervalDays", before.reminderIntervalDays, input.ack.reminderIntervalDays);
      track("escalationDays", before.escalationDays, input.ack.escalationDays);
      track("escalationTarget", before.escalationTarget, input.ack.escalationTarget);
      if (audienceChanged) changes.audience = { from: beforeAudience, to: afterAudience };

      if (Object.keys(changes).length) {
        await recordAudit({ entityType: DOCUMENT_ENTITY, entityId: id, action: DOCUMENT_AUDIT.UPDATED, actor, changes, meta }, tx);
      }
    });

    let notified = 0;
    if (before.status === "PUBLISHED") {
      const title = input.title.trim();
      if (ackTurnedOn) {
        notified = await notifyUsers(audiencePopulationWhere(audienceRows(input.audience)), {
          type: DOCUMENT_NOTIFICATIONS.ACK_REQUIRED,
          title: `Acknowledgement required: ${title}`,
          body: "Please read this document and confirm you have understood it.",
          link: documentLink(id),
          entityType: DOCUMENT_ENTITY,
          entityId: id,
        });
      } else if (audienceChanged) {
        // Only people who were NOT in the previous audience hear about it.
        const newlyIncluded: Prisma.UserWhereInput = {
          AND: [audiencePopulationWhere(audienceRows(input.audience)), { NOT: audiencePopulationWhere(before.audiences) }],
        };
        notified = await notifyUsers(newlyIncluded, {
          type: DOCUMENT_NOTIFICATIONS.ASSIGNED,
          title: `New document: ${title}`,
          body: input.ack.requiresAcknowledgement ? "Please read this document and confirm you have understood it." : "A new document is available to you.",
          link: documentLink(id),
          entityType: DOCUMENT_ENTITY,
          entityId: id,
        });
      }
    }
    return { id, notified };
  },

  async publish(id: string, actor: CurrentUser, meta: RequestMeta) {
    const before = await loadForCommand(id);
    if (before.status !== "DRAFT") throw new BusinessRuleError("Only draft documents can be published.");
    // A survey may go out without a file; any other document needs one.
    if (!before.currentVersion && !(await prisma.documentSurvey.count({ where: currentSurveyWhere(id) }))) {
      throw new BusinessRuleError("Upload a file before publishing.");
    }
    if (!before.audiences.length) throw new BusinessRuleError("Choose at least one audience before publishing.");

    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          ...(before.requiresAcknowledgement && before.ackRequiredFromVersion === null ? { ackRequiredFromVersion: before.currentVersion?.versionNumber ?? 1 } : {}),
        },
      });
      await recordAudit({ entityType: DOCUMENT_ENTITY, entityId: id, action: DOCUMENT_AUDIT.PUBLISHED, actor, changes: { status: { from: "DRAFT", to: "PUBLISHED" } }, meta }, tx);
    });
    const notified = await notifyAssigned(before, before.audiences);
    // A survey created with the draft goes live now.
    await notifySurveyOnPublish(before);
    return { id, notified };
  },

  async archive(id: string, actor: CurrentUser, meta: RequestMeta) {
    const before = await loadForCommand(id);
    if (before.status === "ARCHIVED") throw new BusinessRuleError("The document is already archived.");
    await prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
      await recordAudit({ entityType: DOCUMENT_ENTITY, entityId: id, action: DOCUMENT_AUDIT.ARCHIVED, actor, changes: { status: { from: before.status, to: "ARCHIVED" } }, meta }, tx);
    });
    return { id };
  },

  async restore(id: string, actor: CurrentUser, meta: RequestMeta) {
    const before = await loadForCommand(id);
    if (before.status !== "ARCHIVED") throw new BusinessRuleError("Only archived documents can be restored.");
    const status = before.publishedAt ? "PUBLISHED" : "DRAFT";
    await prisma.$transaction(async (tx) => {
      await assertUniqueIdentity(tx, { title: before.title, referenceCode: "" }, id);
      await tx.document.update({ where: { id }, data: { status, archivedAt: null } });
      await recordAudit({ entityType: DOCUMENT_ENTITY, entityId: id, action: DOCUMENT_AUDIT.RESTORED, actor, changes: { status: { from: "ARCHIVED", to: status } }, meta }, tx);
    });
    return { id, status };
  },

  /**
   * Issues a new version. Previous versions stay in history. When `requireReacknowledgement`
   * is set (and the document needs acknowledgement) earlier acknowledgements stop counting:
   * `ackRequiredFromVersion` moves to the new version number.
   */
  async addVersion(id: string, input: NewVersionInput, actor: CurrentUser, meta: RequestMeta) {
    const before = await loadForCommand(id);
    if (before.status === "ARCHIVED") throw new BusinessRuleError("Restore the document before uploading a new version.");
    const reack = input.requireReacknowledgement && before.requiresAcknowledgement;

    const version = await prisma.$transaction(async (tx) => {
      const file = await uploadService.consume(input.uploadId, actor, "document-version", tx);
      const latest = await tx.documentVersion.aggregate({ where: { documentId: id }, _max: { versionNumber: true } });
      const versionNumber = (latest._max.versionNumber ?? 0) + 1;
      const created = await tx.documentVersion.create({
        data: {
          organizationId: actor.organizationId,
          documentId: id,
          versionNumber,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          storageDriver: file.storageDriver,
          storageKey: file.storageKey,
          checksum: file.checksum,
          changeNote: emptyToNull(input.changeNote),
          requiresReacknowledgement: reack,
          uploadedById: actor.id,
          createdAt: new Date(),
        },
      });
      await tx.document.update({
        where: { id },
        data: { currentVersionId: created.id, ...(reack ? { ackRequiredFromVersion: versionNumber } : {}) },
      });
      await recordAudit(
        {
          entityType: DOCUMENT_ENTITY,
          entityId: id,
          action: DOCUMENT_AUDIT.VERSION_ADDED,
          actor,
          changes: {
            versionNumber: { from: before.currentVersion?.versionNumber ?? null, to: versionNumber },
            fileName: file.fileName,
            sizeBytes: file.sizeBytes,
            changeNote: emptyToNull(input.changeNote),
            requiresReacknowledgement: reack,
            ...(reack ? { ackRequiredFromVersion: { from: before.ackRequiredFromVersion, to: versionNumber } } : {}),
          },
          meta,
        },
        tx,
      );
      return created;
    });

    let notified = 0;
    if (before.status === "PUBLISHED" && reack) {
      notified = await notifyUsers(audiencePopulationWhere(before.audiences), {
        type: DOCUMENT_NOTIFICATIONS.VERSION_ISSUED,
        title: `Updated: ${before.title} (version ${version.versionNumber})`,
        body: "A new version has been issued. Please read it and acknowledge it again.",
        link: documentLink(id),
        entityType: DOCUMENT_ENTITY,
        entityId: id,
      });
    }
    return { id: version.id, versionNumber: version.versionNumber, requiresReacknowledgement: reack, notified };
  },
};
