import { lawVersionSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawTaskService } from "@/server/modules/law/task.service";

/** POST /api/law/tasks/:id/restore – restore the task (history and source navigation are kept). */
export const POST = apiHandler({ module: "law", body: lawVersionSchema }, async ({ params, body, user, meta }) => lawTaskService.setArchived(params.id!, false, body.expectedVersion, user, meta));
