import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CreateEvidenceInput, EvidenceDto, EvidenceListDto } from "@/lib/validation/evidence";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { NotFoundError, ValidationError } from "@/server/http/errors";
import { canEditEntity, requireEntityAccess } from "@/server/modules/entities/registry";
import { uploadService } from "@/server/modules/uploads/upload.service";
import { streamFile } from "@/server/storage/file-response";

const select = {
  id: true,
  entityType: true,
  entityId: true,
  kind: true,
  name: true,
  url: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  storageDriver: true,
  storageKey: true,
  createdAt: true,
  removedAt: true,
  uploadedBy: { select: { id: true, name: true } },
} satisfies Prisma.AttachmentSelect;

type Row = Prisma.AttachmentGetPayload<{ select: typeof select }>;

function toDto(row: Row): EvidenceDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    url: row.kind === "LINK" ? row.url : null,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    downloadUrl: row.kind === "FILE" ? `/api/evidence/${row.id}/file` : null,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export const EVIDENCE_AUDIT = { ADDED: "EVIDENCE_ADDED", REMOVED: "EVIDENCE_REMOVED" } as const;

/**
 * Evidence (files + named links) on any registered record. Access is decided by the owning
 * module's entity descriptor: view → list/download, edit → add/remove. Audit entries are
 * written against the owning record, so they appear in its history.
 */
export const evidenceService = {
  async list(user: CurrentUser, entityType: string, entityId: string): Promise<EvidenceListDto> {
    await requireEntityAccess(user, entityType, entityId, "view");
    const [rows, canEdit] = await Promise.all([
      prisma.attachment.findMany({ where: { entityType, entityId, removedAt: null }, orderBy: { createdAt: "asc" }, select }),
      canEditEntity(user, entityType, entityId),
    ]);
    return { items: rows.map(toDto), canEdit };
  },

  async add(user: CurrentUser, input: CreateEvidenceInput, meta: RequestMeta): Promise<EvidenceDto> {
    await requireEntityAccess(user, input.entityType, input.entityId, "edit");
    return prisma.$transaction(async (tx) => {
      let data: Prisma.AttachmentUncheckedCreateInput;
      if (input.kind === "FILE") {
        const file = await uploadService.consume(input.uploadId, user, "evidence", tx);
        if (!file.sizeBytes) throw new ValidationError("The file is empty.");
        data = {
          organizationId: user.organizationId,
          entityType: input.entityType,
          entityId: input.entityId,
          kind: "FILE",
          name: input.name?.trim() || file.fileName,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          storageDriver: file.storageDriver,
          storageKey: file.storageKey,
          uploadedById: user.id,
        };
      } else {
        data = {
          organizationId: user.organizationId,
          entityType: input.entityType,
          entityId: input.entityId,
          kind: "LINK",
          name: input.name.trim(),
          url: input.url.trim(),
          uploadedById: user.id,
        };
      }
      const row = await tx.attachment.create({ data, select });
      await recordAudit(
        {
          entityType: input.entityType,
          entityId: input.entityId,
          action: EVIDENCE_AUDIT.ADDED,
          actor: user,
          changes: { evidence: { kind: row.kind, name: row.name, fileName: row.fileName, url: row.url, sizeBytes: row.sizeBytes } },
          metadata: { attachmentId: row.id },
          meta,
        },
        tx,
      );
      return toDto(row);
    });
  },

  /** Detaches the evidence (removedAt); the stored object is kept for the audit trail. */
  async remove(user: CurrentUser, id: string, meta: RequestMeta): Promise<void> {
    const row = await prisma.attachment.findFirst({ where: { id, removedAt: null }, select });
    if (!row) throw new NotFoundError();
    await requireEntityAccess(user, row.entityType, row.entityId, "edit");
    await prisma.$transaction(async (tx) => {
      const result = await tx.attachment.updateMany({ where: { id, removedAt: null }, data: { removedAt: new Date() } });
      if (result.count !== 1) throw new NotFoundError();
      await recordAudit(
        {
          entityType: row.entityType,
          entityId: row.entityId,
          action: EVIDENCE_AUDIT.REMOVED,
          actor: user,
          changes: { evidence: { kind: row.kind, name: row.name, fileName: row.fileName, url: row.url } },
          metadata: { attachmentId: row.id },
          meta,
        },
        tx,
      );
    });
  },

  /** Streams a file only after the owning record's access check (tenant scoping + module policy). */
  async streamFile(user: CurrentUser, id: string, options: { download: boolean }): Promise<Response> {
    const row = await prisma.attachment.findFirst({ where: { id, kind: "FILE", removedAt: null }, select });
    if (!row || !row.storageDriver || !row.storageKey || !row.fileName) throw new NotFoundError();
    await requireEntityAccess(user, row.entityType, row.entityId, "view");
    return streamFile(
      {
        storageDriver: row.storageDriver,
        storageKey: row.storageKey,
        fileName: row.fileName,
        mimeType: row.mimeType ?? "application/octet-stream",
        sizeBytes: row.sizeBytes,
      },
      { inline: !options.download },
    );
  },
};
