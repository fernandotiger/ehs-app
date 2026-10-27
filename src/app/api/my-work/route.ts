import { apiHandler } from "@/server/http/api-handler";
import { myWorkService } from "@/server/modules/jobs/my-work.service";

/** GET /api/my-work – everything assigned to me (owner or reviewer) from every due-work provider. */
export const GET = apiHandler({}, async ({ user }) => myWorkService.list(user));
