import { lawVersionSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawProfileService } from "@/server/modules/law/profile.service";

/** POST /api/law/profiles/:id/restore – bring an archived profile back. */
export const POST = apiHandler({ module: "law", body: lawVersionSchema }, async ({ params, body, user, meta }) => lawProfileService.setArchived(params.id!, false, body.expectedVersion, user, meta));
