import { lawAcceptSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawProfileService } from "@/server/modules/law/profile.service";

/** GET /api/law/profiles/:id/update – what accepting the latest installed content would change. */
export const GET = apiHandler({ module: "law" }, async ({ params, user }) => lawProfileService.updatePreview(user, params.id!));

/** POST /api/law/profiles/:id/update – accept the latest installed content into this profile only. */
export const POST = apiHandler({ module: "law", body: lawAcceptSchema }, async ({ params, body, user, meta }) => lawProfileService.accept(params.id!, body, user, meta));
