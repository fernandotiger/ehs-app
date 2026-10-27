import { apiHandler } from "@/server/http/api-handler";
import { formService } from "@/server/modules/forms/form.service";

/** GET /api/forms/versions/:versionId – one immutable published version (any signed-in user of the tenant). */
export const GET = apiHandler({}, async ({ params }) => formService.getVersion(params.versionId!));
