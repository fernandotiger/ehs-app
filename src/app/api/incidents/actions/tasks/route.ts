import { actionListQuerySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { actionQueryService } from "@/server/modules/incidents/action-query.service";

/** GET /api/incidents/actions/tasks – child task register (Tasks tab). */
export const GET = apiHandler({ module: "incidents", query: actionListQuerySchema }, async ({ query, user }) => actionQueryService.tasks(user, query));
