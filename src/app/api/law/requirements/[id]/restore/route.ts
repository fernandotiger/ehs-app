import { lawVersionSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawRequirementService } from "@/server/modules/law/requirement.service";

/** POST /api/law/requirements/:id/restore – restore a company requirement. */
export const POST = apiHandler({ module: "law", body: lawVersionSchema }, async ({ params, body, user, meta }) => lawRequirementService.setOtherArchived(params.id!, false, body.expectedVersion, user, meta));
