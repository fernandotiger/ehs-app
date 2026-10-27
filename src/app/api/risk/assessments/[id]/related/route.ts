import { relatedLinkSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { assessmentService } from "@/server/modules/risk/assessment.service";

/** POST /api/risk/assessments/:id/related – relate another assessment at the same site. */
export const POST = apiHandler({ module: "risk", body: relatedLinkSchema }, async ({ params, body, user, meta }) => assessmentService.link(params.id!, body.otherId, user, meta));
