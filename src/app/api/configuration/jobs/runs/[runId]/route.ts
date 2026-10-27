import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { jobService } from "@/server/modules/jobs/job.service";

const P = PERMISSIONS;

/** GET /api/configuration/jobs/runs/:runId – run details with matched items. */
export const GET = apiHandler({ permission: [P.CONFIG_JOBS_VIEW, P.CONFIG_JOBS_MANAGE, P.CONFIG_JOBS_TEST] }, async ({ params, user }) => jobService.run(params.runId!, user));
