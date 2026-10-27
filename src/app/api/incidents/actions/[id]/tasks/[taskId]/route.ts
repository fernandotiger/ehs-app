import { taskInputSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";

/** PUT /api/incidents/actions/:id/tasks/:taskId – edit an open task. */
export const PUT = apiHandler({ module: "incidents", body: taskInputSchema }, async ({ params, body, user, meta }) =>
  actionService.updateTask(params.id!, params.taskId!, body, user, meta),
);
