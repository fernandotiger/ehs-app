import { z } from "zod";
import { scheduledJobInputSchema } from "@/lib/jobs";
import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { jobService } from "@/server/modules/jobs/job.service";

const P = PERMISSIONS;
const query = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(["active", "paused", "all"]).optional() });

/** GET /api/configuration/jobs?q&status=active|paused|all */
export const GET = apiHandler({ permission: [P.CONFIG_JOBS_VIEW, P.CONFIG_JOBS_MANAGE, P.CONFIG_JOBS_TEST], query }, async ({ query, user }) => jobService.list(query, user));

/** POST /api/configuration/jobs – create a job (422 with correction guidance when the rules are incomplete). */
export const POST = apiHandler({ permission: P.CONFIG_JOBS_MANAGE, body: scheduledJobInputSchema }, async ({ body, user, meta }) => jobService.create(body, user, meta));
