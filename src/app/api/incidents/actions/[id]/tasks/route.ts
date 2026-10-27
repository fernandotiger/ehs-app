import { taskInputSchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionService } from "@/server/modules/incidents/action.service";

/** POST /api/incidents/actions/:id/tasks – add a child task. */
export const POST = apiHandler({ module: "incidents", body: taskInputSchema }, async ({ params, body, user, meta }) => actionService.addTask(params.id!, body, user, meta));
