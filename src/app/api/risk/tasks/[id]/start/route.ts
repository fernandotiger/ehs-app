import { riskVersionSchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { taskService } from "@/server/modules/risk/task.service";

/** POST /api/risk/tasks/:id/start – Open → In progress. */
export const POST = apiHandler({ module: "risk", body: riskVersionSchema }, async ({ params, body, user, meta }) => taskService.start(params.id!, body.expectedVersion, user, meta));
