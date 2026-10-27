import { scheduledJobUpdateSchema } from "@/lib/jobs";
import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { jobService } from "@/server/modules/jobs/job.service";

const P = PERMISSIONS;

/** GET /api/configuration/jobs/:id */
export const GET = apiHandler({ permission: [P.CONFIG_JOBS_VIEW, P.CONFIG_JOBS_MANAGE, P.CONFIG_JOBS_TEST] }, async ({ params, user }) => jobService.get(params.id!, user));

/** PATCH /api/configuration/jobs/:id – full job + expectedVersion (409 STALE_VERSION). */
export const PATCH = apiHandler({ permission: P.CONFIG_JOBS_MANAGE, body: scheduledJobUpdateSchema }, async ({ params, body, user, meta }) => jobService.update(params.id!, body, user, meta));
