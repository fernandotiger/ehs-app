import { z } from "zod";
import { apiHandler } from "@/server/http/api-handler";
import { incidentQueryService } from "@/server/modules/incidents/incident-query.service";

const query = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });

/** GET /api/incidents/:id/history – signed audit trail of the incident and its investigation. */
export const GET = apiHandler({ module: "incidents", query }, async ({ params, query, user }) => incidentQueryService.history(user, params.id!, query.page, query.pageSize));
