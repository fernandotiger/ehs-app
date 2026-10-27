import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ACKNOWLEDGEMENT_STATEMENT, type AcknowledgementSource } from "@/lib/validation/documents";
import { recordAudit } from "@/server/audit/audit-service";
import { signRecord } from "@/server/audit/signing";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, NotFoundError } from "@/server/http/errors";
import { acknowledgementSigningPayload, satisfiesRequirement } from "./acknowledgement-rules";
import { audienceIncludesPrincipal, audienceRowSelect, visibleDocumentsWhere } from "./document-access.policy";
import { DOCUMENT_AUDIT, DOCUMENT_ENTITY, DOCUMENT_VERSION_ENTITY } from "./document-audit-actions";
import { iso } from "./document-mappers";
import type { AcknowledgementReceiptDto } from "./document.dto";

export interface AcknowledgeOptions {
  versionId: string;
  source: AcknowledgementSource;
  /** When the employee confirmed on their device (offline sync). */
  clientAcknowledgedAt?: Date | null;
}

export interface AcknowledgeResult extends AcknowledgementReceiptDto {
  /** false when an existing acknowledgement was returned (idempotent re-acknowledge). */
  created: boolean;
}

type AckRow = Prisma.DocumentAcknowledgementGetPayload<object>;

function toResult(row: AckRow, created: boolean): AcknowledgeResult {
  return {
    id: row.id,
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    acknowledgedAt: row.acknowledgedAt.toISOString(),
    clientAcknowledgedAt: iso(row.clientAcknowledgedAt),
    source: row.source,
    statement: row.statement,
    created,
  };
}

export const acknowledgementService = {
  /**
   * Records "I confirm that I have read and understood this document." for one version.
   *
   * Guards: the document is visible and assigned to the user, published and requires
   * acknowledgement; the version is current (online) or still satisfies the requirement
   * (offline replay); and the user has actually opened that version (DOCUMENT_FILE_ACCESSED).
   * Acknowledgements are insert-only and HMAC-signed; re-acknowledging returns the original.
   */
  async acknowledge(documentId: string, options: AcknowledgeOptions, user: CurrentUser, meta: RequestMeta): Promise<AcknowledgeResult> {
    const doc = await prisma.document.findFirst({
      where: { AND: [{ id: documentId }, visibleDocumentsWhere(user)] },
      select: {
        id: true,
        title: true,
        status: true,
        requiresAcknowledgement: true,
        ackRequiredFromVersion: true,
        currentVersionId: true,
        audiences: { select: audienceRowSelect },
      },
    });
    if (!doc) throw new NotFoundError();

    const version = await prisma.documentVersion.findFirst({ where: { id: options.versionId, documentId }, select: { id: true, versionNumber: true } });
    if (!version) throw new NotFoundError("Version not found");

    const existing = await prisma.documentAcknowledgement.findUnique({ where: { userId_versionId: { userId: user.id, versionId: version.id } } });
    if (existing) return toResult(existing, false);

    if (doc.status !== "PUBLISHED") throw new BusinessRuleError("This document is not published.");
    if (!doc.requiresAcknowledgement) throw new BusinessRuleError("This document does not require acknowledgement.");
    if (!audienceIncludesPrincipal(doc.audiences, user)) throw new BusinessRuleError("This document is not assigned to you.");

    const isCurrent = version.id === doc.currentVersionId;
    if (options.source === "ONLINE" && !isCurrent) {
      throw new BusinessRuleError("A newer version of this document is available. Please open and acknowledge the current version.");
    }
    if (!satisfiesRequirement(version.versionNumber, doc.ackRequiredFromVersion)) {
      throw new BusinessRuleError("A newer version of this document must be read and acknowledged.");
    }

    const opened = await prisma.auditLog.count({
      where: { entityType: DOCUMENT_VERSION_ENTITY, entityId: version.id, actorId: user.id, action: DOCUMENT_AUDIT.FILE_ACCESSED },
    });
    if (!opened) throw new BusinessRuleError("Please open and read the document before acknowledging it.");

    const fields = {
      organizationId: user.organizationId,
      documentId: doc.id,
      documentTitle: doc.title,
      versionId: version.id,
      versionNumber: version.versionNumber,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      statement: ACKNOWLEDGEMENT_STATEMENT,
      acknowledgedAt: new Date(),
      clientAcknowledgedAt: options.clientAcknowledgedAt ?? null,
      source: options.source,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    };

    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.documentAcknowledgement.create({
          data: { ...fields, signature: signRecord(acknowledgementSigningPayload(fields)) },
        });
        await recordAudit(
          {
            entityType: DOCUMENT_ENTITY,
            entityId: doc.id,
            action: DOCUMENT_AUDIT.ACKNOWLEDGED,
            actor: user,
            metadata: {
              acknowledgementId: created.id,
              versionId: version.id,
              versionNumber: version.versionNumber,
              source: options.source,
              clientAcknowledgedAt: iso(fields.clientAcknowledgedAt),
            },
            meta,
          },
          tx,
        );
        return created;
      });
      return toResult(row, true);
    } catch (error) {
      // A concurrent request (double click, online + sync) won the insert – return that record.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await prisma.documentAcknowledgement.findUnique({ where: { userId_versionId: { userId: user.id, versionId: version.id } } });
        if (winner) return toResult(winner, false);
      }
      throw error;
    }
  },
};
