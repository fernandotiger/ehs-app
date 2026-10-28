import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentDocumentService } from "@/server/modules/risk/assessment-document.service";

/**
 * POST /api/risk/assessments/:id/document-pdf – PDF of the assessment stored as the caller's
 * document upload → { uploadId, fileName, sizeBytes, title, description } for the Upload document page.
 * Documents module + `document.manage` (403); assessment outside the caller's access → 404.
 */
export const POST = apiHandler({ module: "risk", permission: PERMISSIONS.DOCUMENTS_MANAGE }, async ({ params, user, meta }) =>
  assessmentDocumentService.createPdfUpload(user, params.id!, meta),
);
