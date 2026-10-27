import { jobEnabledSchema } from "@/lib/jobs";
import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { jobService } from "@/server/modules/jobs/job.service";

/** PUT /api/configuration/jobs/:id/enabled – { enabled } pause or resume scheduled runs. */
export const PUT = apiHandler({ permission: PERMISSIONS.CONFIG_JOBS_MANAGE, body: jobEnabledSchema }, async ({ params, body, user, meta }) =>
  jobService.setEnabled(params.id!, body.enabled, user, meta),
);
