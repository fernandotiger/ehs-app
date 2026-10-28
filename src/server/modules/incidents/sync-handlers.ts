import "server-only";
import { PERMISSIONS } from "@/lib/permissions";
import { incidentCreateSchema } from "@/lib/validation/incidents";
import { requirePermission } from "@/server/auth/authorization";
import { ValidationError } from "@/server/http/errors";
import type { SyncHandlerMap } from "@/server/modules/sync/sync.types";
import { incidentService } from "./incident.service";

/**
 * `incident.report` – a report (draft or submitted) saved on the device while offline. The outbox
 * operation id is the report's clientId, so a replay returns the incident created the first time.
 * All gates (required answers, people, investigators …) run here at sync time.
 */
export const incidentSyncHandlers: SyncHandlerMap = {
  "incident.report": async (payload, ctx) => {
    requirePermission(ctx.user, PERMISSIONS.INCIDENT_CREATE);
    const parsed = incidentCreateSchema.safeParse({ ...payload, clientId: payload.clientId ?? ctx.operationId });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ValidationError(first ? `${first.path.join(".") || "report"}: ${first.message}` : "Invalid offline report", parsed.error.issues);
    }
    const result = await incidentService.create(parsed.data, ctx.user, ctx.meta, { source: "OFFLINE_SYNC" });
    // The sync log stores this result next to the user's id – an anonymous report must not be named in it.
    return parsed.data.anonymous ? { anonymous: true, isDraft: result.isDraft, created: result.created } : result;
  },
};
