import { PERMISSIONS } from "@/lib/permissions";
import { assessmentCreateSchema, assessmentListQuerySchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentQueryService } from "@/server/modules/risk/assessment-query.service";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** GET /api/risk/assessments – register (risk.view scope OR owner/approver/participant). */
export const GET = apiHandler({ module: "risk", query: assessmentListQuerySchema }, async ({ query, user }) => assessmentQueryService.list(user, query));

/** POST /api/risk/assessments – new assessment from a published Risk form (decision: draft | submit | approve). Idempotent on clientId. */
export const POST = apiHandler({ module: "risk", permission: PERMISSIONS.RISK_CREATE, body: assessmentCreateSchema }, async ({ body, user, meta }) => assessmentService.create(body, user, meta));
