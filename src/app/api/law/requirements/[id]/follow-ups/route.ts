import { apiHandler } from "@/server/http/api-handler";
import { lawConnectionService } from "@/server/modules/law/connections.service";

/** GET /api/law/requirements/:id/follow-ups – incident drafts and corrective actions raised from it, with their status. */
export const GET = apiHandler({ module: "law" }, async ({ params, user }) => lawConnectionService.followUps(user, params.id!));
