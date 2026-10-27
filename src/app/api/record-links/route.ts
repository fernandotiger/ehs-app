import { entityRefSchema } from "@/lib/validation/evidence";
import { apiHandler } from "@/server/http/api-handler";
import { recordLinkService } from "@/server/modules/record-links/record-link.service";

/** GET /api/record-links?entityType&entityId – follow-ups raised from, and sources of, a record. */
export const GET = apiHandler({ query: entityRefSchema }, async ({ query, user }) => recordLinkService.linked(user, query.entityType, query.entityId));
