import { publishedFormsQuerySchema } from "@/lib/validation/forms";
import { apiHandler } from "@/server/http/api-handler";
import { formService } from "@/server/modules/forms/form.service";

/** GET /api/forms/published?module&purpose&siteId – compatible published forms for workflow selectors (any signed-in user). */
export const GET = apiHandler({ query: publishedFormsQuerySchema }, async ({ query }) => formService.listPublished(query.module, query.purpose, { siteId: query.siteId }));
