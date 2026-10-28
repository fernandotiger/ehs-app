import { lawVersionSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawProfileService } from "@/server/modules/law/profile.service";

/** POST /api/law/profiles/:id/archive – hide the profile (all its work is kept). */
export const POST = apiHandler({ module: "law", body: lawVersionSchema }, async ({ params, body, user, meta }) => lawProfileService.setArchived(params.id!, true, body.expectedVersion, user, meta));
