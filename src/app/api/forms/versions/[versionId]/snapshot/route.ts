import { snapshotQuerySchema } from "@/lib/validation/forms";
import { apiHandler } from "@/server/http/api-handler";
import { captureQuestionnaire } from "@/server/modules/forms/questionnaire.service";

/** GET /api/forms/versions/:versionId/snapshot?siteId – the questionnaire a record at that site would capture. */
export const GET = apiHandler({ query: snapshotQuerySchema }, async ({ params, query }) => captureQuestionnaire(params.versionId!, { siteId: query.siteId }));
