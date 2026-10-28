import { lawVersionSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawRequirementService } from "@/server/modules/law/requirement.service";

/** POST /api/law/requirements/:id/archive – archive a company requirement. */
export const POST = apiHandler({ module: "law", body: lawVersionSchema }, async ({ params, body, user, meta }) => lawRequirementService.setOtherArchived(params.id!, true, body.expectedVersion, user, meta));
