import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { lawSettingsService } from "@/server/modules/law/settings.service";

/** POST /api/law/settings/incident-type – set up / switch on the Non Compliance incident type Law raises drafts with. */
export const POST = apiHandler({ module: "law", permission: PERMISSIONS.INCIDENT_CONFIGURE }, async ({ user, meta }) => lawSettingsService.setUpIncidentType(user, meta));
