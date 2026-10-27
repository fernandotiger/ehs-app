import { jobRunsQuerySchema } from "@/lib/jobs";
import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { jobService } from "@/server/modules/jobs/job.service";

const P = PERMISSIONS;

/** GET /api/configuration/jobs/runs?jobId&outcome&trigger&page&pageSize – run history (latest 500 kept). */
export const GET = apiHandler({ permission: [P.CONFIG_JOBS_VIEW, P.CONFIG_JOBS_MANAGE, P.CONFIG_JOBS_TEST], query: jobRunsQuerySchema }, async ({ query, user }) =>
  jobService.runs(query, user),
);
