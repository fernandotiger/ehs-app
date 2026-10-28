import { lawVersionSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawRequirementService } from "@/server/modules/law/requirement.service";

/** POST /api/law/requirements/:id/include – applies again; the same saved evaluation comes back. */
export const POST = apiHandler({ module: "law", body: lawVersionSchema }, async ({ params, body, user, meta }) => lawRequirementService.include(params.id!, body.expectedVersion, user, meta));
