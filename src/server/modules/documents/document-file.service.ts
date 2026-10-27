import "server-only";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { NotFoundError } from "@/server/http/errors";
import { streamFile } from "@/server/storage/file-response";
import { canAccessVersion, visibleDocumentsWhere } from "./document-access.policy";
import { DOCUMENT_AUDIT, DOCUMENT_VERSION_ENTITY } from "./document-audit-actions";

export const documentFileService = {
  /**
   * Streams a document version after applying the visibility policy. Employees may only
   * fetch the current version; managers may fetch history. Every successful access is
   * audited as DOCUMENT_FILE_ACCESSED – this is the evidence that the employee opened the
   * version before acknowledging it.
   */
  async stream(user: CurrentUser, documentId: string, versionId: string, options: { download: boolean }, meta: RequestMeta): Promise<Response> {
    const doc = await prisma.document.findFirst({
      where: { AND: [{ id: documentId }, visibleDocumentsWhere(user)] },
      select: { id: true, currentVersionId: true },
    });
    if (!doc || !canAccessVersion(user, doc, versionId)) throw new NotFoundError();

    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      select: { id: true, versionNumber: true, fileName: true, mimeType: true, sizeBytes: true, storageDriver: true, storageKey: true },
    });
    if (!version) throw new NotFoundError();

    const response = await streamFile(version, { inline: !options.download });
    await recordAudit({
      entityType: DOCUMENT_VERSION_ENTITY,
      entityId: version.id,
      action: DOCUMENT_AUDIT.FILE_ACCESSED,
      actor: user,
      metadata: { documentId, versionNumber: version.versionNumber, disposition: options.download ? "download" : "inline" },
      meta,
    });
    return response;
  },
};
