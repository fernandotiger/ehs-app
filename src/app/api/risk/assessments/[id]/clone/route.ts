import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** POST /api/risk/assessments/:id/clone – a new Draft with copied content (no revisions, reviews or attachments). */
export const POST = apiHandler({ module: "risk", permission: PERMISSIONS.RISK_CREATE }, async ({ params, user, meta }) => assessmentService.clone(params.id!, user, meta));
