import { PERMISSIONS } from "@/lib/permissions";
import { importRequestSchema } from "@/lib/validation/configuration";
import { apiHandler } from "@/server/http/api-handler";
import { bulkImportService } from "@/server/modules/configuration/bulk-import.service";

/** POST /api/configuration/import/apply – validates again and applies everything in one transaction (or nothing). */
export const POST = apiHandler({ permission: PERMISSIONS.CONFIG_BULK_IMPORT, body: importRequestSchema }, async ({ body, user, meta }) =>
  bulkImportService.apply(body.content, body.fileName, user, meta),
);
