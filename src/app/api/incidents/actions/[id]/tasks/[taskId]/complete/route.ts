import { taskCompleteSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";

/** POST /api/incidents/actions/:id/tasks/:taskId/complete – complete a task (never completes the action). */
export const POST = apiHandler({ module: "incidents", body: taskCompleteSchema }, async ({ params, body, user, meta }) =>
  actionService.completeTask(params.id!, params.taskId!, body.completionComment, user, meta),
);
