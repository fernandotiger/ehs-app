import { PERMISSIONS } from "@/lib/permissions";
import { importRequestSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { bulkImportService } from "@/server/modules/configuration/bulk-import.service";

/** POST /api/configuration/import/review – { content } → rows, per-line issues and counts (nothing is saved). */
export const POST = apiHandler({ permission: PERMISSIONS.CONFIG_BULK_IMPORT, body: importRequestSchema }, async ({ body, user }) =>
  bulkImportService.review(body.content, user),
);
