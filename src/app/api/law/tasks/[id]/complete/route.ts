import { lawTaskCompleteSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawTaskService } from "@/server/modules/law/task.service";

/** POST /api/law/tasks/:id/complete – done, with a required comment (the evaluation does not change). */
export const POST = apiHandler({ module: "law", body: lawTaskCompleteSchema }, async ({ params, body, user, meta }) => lawTaskService.complete(params.id!, body, user, meta));
