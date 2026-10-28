import { lawRaiseActionSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawConnectionService } from "@/server/modules/law/connections.service";

/** POST /api/law/requirements/:id/action – corrective action with legal provenance (no incident needed). */
export const POST = apiHandler({ module: "law", body: lawRaiseActionSchema }, async ({ params, body, user, meta }) => lawConnectionService.raiseAction(user, params.id!, body, meta));
