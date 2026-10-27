import { PERMISSIONS } from "@/lib/permissions";
import { structureListQuerySchema, structureNodeSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { levelOf } from "@/server/modules/configuration/config-access";
import { structureService } from "@/server/modules/configuration/structure.service";

/** GET /api/configuration/structure/:level – business-units | sites | locations | departments (paginated, with counts). */
export const GET = apiHandler({ permission: PERMISSIONS.ADMIN_ORGANISATION, query: structureListQuerySchema }, async ({ params, query, user }) =>
  structureService.list(levelOf(params), query, user),
);

/** POST /api/configuration/structure/:level – create (an existing parent is required except for business units). */
export const POST = apiHandler({ permission: PERMISSIONS.ADMIN_ORGANISATION, body: structureNodeSchema }, async ({ params, body, user, meta }) =>
  structureService.create(levelOf(params), body, user, meta),
);
