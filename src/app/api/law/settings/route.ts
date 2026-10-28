import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { lawSettingsService } from "@/server/modules/law/settings.service";

/** GET /api/law/settings – library versions and the Non Compliance incident type status. */
export const GET = apiHandler({ module: "law", permission: [PERMISSIONS.LAW_REQUIREMENT_MANAGE, PERMISSIONS.INCIDENT_CONFIGURE] }, async ({ user }) => lawSettingsService.get(user));
