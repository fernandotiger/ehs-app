import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { jobService } from "@/server/modules/jobs/job.service";

/** POST /api/configuration/jobs/:id/test – evaluate the saved job, record a TEST run, deliver nothing. */
export const POST = apiHandler({ permission: PERMISSIONS.CONFIG_JOBS_TEST }, async ({ params, user, meta }) => jobService.test(params.id!, user, meta));
