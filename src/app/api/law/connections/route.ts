import { lawConnectionsQuerySchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawConnectionService } from "@/server/modules/law/connections.service";

/** GET /api/law/connections?entityType&entityId – legal requirements linked to (or that raised) a Risk / Incident record. */
export const GET = apiHandler({ module: "law", query: lawConnectionsQuerySchema }, async ({ query, user }) => lawConnectionService.connections(user, query.entityType, query.entityId));
