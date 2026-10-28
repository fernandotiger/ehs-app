import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";

/** GET /api/law/summary – my open / overdue Law tasks and requirements I own that are due for review (Home, Tasks). */
export const GET = apiHandler({ module: "law" }, async ({ user }) => lawQueryService.summary(user));
