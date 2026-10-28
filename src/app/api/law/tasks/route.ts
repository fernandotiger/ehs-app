import { lawTaskCreateSchema, lawTaskListQuerySchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";
import { lawTaskService } from "@/server/modules/law/task.service";

/** GET /api/law/tasks?view=mine|all&status&profileId&requirementId&register&due&q – Law tasks. */
export const GET = apiHandler({ module: "law", query: lawTaskListQuerySchema }, async ({ query, user }) => lawQueryService.tasks(user, query));

/** POST /api/law/tasks – task on a requirement (owner, department in the profile's site, due date, priority). */
export const POST = apiHandler({ module: "law", body: lawTaskCreateSchema }, async ({ body, user, meta }) => lawTaskService.create(body, user, meta));
