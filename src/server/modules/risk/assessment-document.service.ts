import "server-only";
import { PERMISSIONS } from "@/lib/permissions";
import { documentSuggestion, formatDay, pdfFileName, personAnswerIds } from "@/lib/risk/assessment-print";
import { recordAudit } from "@/server/audit/audit-service";
import { moduleEnabled, requirePermission } from "@/server/auth/authorization";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { NotFoundError } from "@/server/http/errors";
import { uploadService } from "@/server/modules/uploads/upload.service";
import { renderAssessmentPdf } from "./assessment-pdf";
import { assessmentQueryService } from "./assessment-query.service";
import { RISK_AUDIT } from "./assessment.service";
import { ASSESSMENT_ENTITY, loadNames } from "./support";

/** What the Upload document page needs to continue with the generated PDF. */
export interface AssessmentPdfUploadDto {
  uploadId: string;
  fileName: string;
  sizeBytes: number;
  /** Suggested document title / description (editable on the Upload document page). */
  title: string;
  description: string;
}

/**
 * "Save as document (PDF)": renders the assessment as a PDF and stores it as the caller's own
 * `document-version` upload, ready for the Upload document page (which consumes it on save).
 * Needs: the Documents module, `document.manage` (403) and an assessment the user can see (404).
 */
export const assessmentDocumentService = {
  async createPdfUpload(user: CurrentUser, id: string, meta: RequestMeta): Promise<AssessmentPdfUploadDto> {
    if (!moduleEnabled(user, "documents")) throw new NotFoundError("The Documents module is not switched on for your company.");
    requirePermission(user, PERMISSIONS.DOCUMENTS_MANAGE);
    const a = await assessmentQueryService.detail(user, id);

    const names = await loadNames(prisma, { users: personAnswerIds(a) });
    const printedOn = formatDay(new Date().toISOString(), user.timeZone);
    const bytes = await renderAssessmentPdf({
      assessment: a,
      organizationName: user.organizationName,
      printedBy: user.name,
      printedOn,
      formatDate: (value) => formatDay(value, user.timeZone),
      personName: (userId) => names.users.get(userId) ?? "Unknown person",
    });

    const fileName = pdfFileName(a);
    const upload = await uploadService.createFromBytes(user, { purpose: "document-version", fileName, mimeType: "application/pdf", bytes }, (tx, file) =>
      recordAudit(
        {
          entityType: ASSESSMENT_ENTITY,
          entityId: a.id,
          action: RISK_AUDIT.PDF_CREATED,
          actor: user,
          changes: { fileName, revision: a.revision },
          metadata: { uploadId: file.uploadId, sizeBytes: file.sizeBytes },
          meta,
        },
        tx,
      ),
    );
    return { uploadId: upload.uploadId, fileName: upload.fileName, sizeBytes: upload.sizeBytes, ...documentSuggestion(a, printedOn) };
  },
};
