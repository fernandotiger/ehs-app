import { PERMISSIONS } from "@/lib/permissions";
import { taskCreateSchema, taskListQuerySchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { taskQueryService } from "@/server/modules/risk/task-query.service";
import { taskService } from "@/server/modules/risk/task.service";

/** GET /api/risk/tasks – task register (risk.task.view scope OR my tasks). */
export const GET = apiHandler({ module: "risk", query: taskListQuerySchema }, async ({ query, user }) => taskQueryService.list(user, query));

/** POST /api/risk/tasks – RA / MP task or sub-task (a programme is always required). */
export const POST = apiHandler({ module: "risk", permission: PERMISSIONS.RISK_TASK_CREATE, body: taskCreateSchema }, async ({ body, user, meta }) => taskService.create(body, user, meta));
