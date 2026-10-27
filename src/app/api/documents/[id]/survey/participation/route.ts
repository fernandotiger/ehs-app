import { surveyParticipationQuerySchema } from "@/lib/validation/document-surveys";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { surveyService } from "@/server/modules/documents/survey.service";

/** GET /api/documents/:id/survey/participation?status=answered|not_answered&q&departmentId&page – who has answered. */
export const GET = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.REPORTS, query: surveyParticipationQuerySchema }, async ({ params, query, user }) =>
  surveyService.participation(params.id!, query, user),
);
