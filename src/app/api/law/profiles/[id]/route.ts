import { lawProfileUpdateSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";
import { lawProfileService } from "@/server/modules/law/profile.service";

/** GET /api/law/profiles/:id – profile with summary and rights. */
export const GET = apiHandler({ module: "law" }, async ({ params, user }) => lawQueryService.profile(user, params.id!));

/** PUT /api/law/profiles/:id – name, owner, jurisdiction, activities, sharing (expectedVersion). */
export const PUT = apiHandler({ module: "law", body: lawProfileUpdateSchema }, async ({ params, body, user, meta }) => lawProfileService.update(params.id!, body, user, meta));
