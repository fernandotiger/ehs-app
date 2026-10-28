import { apiHandler } from "@/server/http/api-handler";
import { lawConnectionService } from "@/server/modules/law/connections.service";

/** DELETE /api/law/requirements/:id/links/:linkId – remove a link made by mistake (audited). */
export const DELETE = apiHandler({ module: "law" }, async ({ params, user, meta }) => lawConnectionService.unlink(user, params.id!, params.linkId!, meta));
