import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { jobService } from "@/server/modules/jobs/job.service";

export const maxDuration = 300;

/** POST /api/configuration/jobs/:id/run – Run now: deliver in-app messages and record a MANUAL run (works while paused). */
export const POST = apiHandler({ permission: PERMISSIONS.CONFIG_JOBS_TEST }, async ({ params, user, meta }) => jobService.runNow(params.id!, user, meta));
