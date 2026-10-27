import { taskCompleteSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { taskService } from "@/server/modules/risk/task.service";

/** POST /api/risk/tasks/:id/complete – comment + date (+ achieved value); a top-level scoring task rescores the Approved assessment. */
export const POST = apiHandler({ module: "risk", body: taskCompleteSchema }, async ({ params, body, user, meta }) => taskService.complete(params.id!, body, user, meta));
