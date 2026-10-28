import { lawTaskUpdateSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";
import { lawTaskService } from "@/server/modules/law/task.service";

/** GET /api/law/tasks/:id – task with its source requirement and the caller's rights. */
export const GET = apiHandler({ module: "law" }, async ({ params, user }) => lawQueryService.task(user, params.id!));

/** PUT /api/law/tasks/:id – edit an open task (creator or evaluator, expectedVersion). */
export const PUT = apiHandler({ module: "law", body: lawTaskUpdateSchema }, async ({ params, body, user, meta }) => lawTaskService.update(params.id!, body, user, meta));
