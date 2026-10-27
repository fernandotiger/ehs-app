import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { structureService } from "@/server/modules/configuration/structure.service";

/** GET /api/configuration/structure/counts – active nodes per level (tab badges). */
export const GET = apiHandler({ permission: PERMISSIONS.ADMIN_ORGANISATION }, async ({ user }) => structureService.counts(user));
