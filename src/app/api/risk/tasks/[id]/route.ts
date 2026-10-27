import { taskUpdateSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { taskQueryService } from "@/server/modules/risk/task-query.service";
import { taskService } from "@/server/modules/risk/task.service";

/** GET /api/risk/tasks/:id – task with sub-tasks, sibling progress and what the caller may do. */
export const GET = apiHandler({ module: "risk" }, async ({ params, user }) => taskQueryService.detail(user, params.id!));

/** PUT /api/risk/tasks/:id – edit an unfinished task (expectedVersion). */
export const PUT = apiHandler({ module: "risk", body: taskUpdateSchema }, async ({ params, body, user, meta }) => taskService.update(params.id!, body, user, meta));
