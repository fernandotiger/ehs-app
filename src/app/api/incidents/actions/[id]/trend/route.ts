import { versionOnlySchema } from "@/lib/validation/incidents";
import { apiHandler } from "@/server/http/api-handler";
import { trendsService } from "@/server/modules/incidents/trends.service";

/** POST /api/incidents/actions/:id/trend – explicitly refresh the trend snapshot (associated incidents unchanged). */
export const POST = apiHandler({ module: "incidents", body: versionOnlySchema }, async ({ params, body, user, meta }) => trendsService.refresh(user, params.id!, body.expectedVersion, meta));
