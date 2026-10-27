import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { IMPORT_TEMPLATE_CSV } from "@/server/modules/configuration/bulk-import";

/** GET /api/configuration/import/template – the CSV template with example rows. */
export const GET = apiHandler(
  { permission: PERMISSIONS.CONFIG_BULK_IMPORT },
  async () =>
    new Response("﻿" + IMPORT_TEMPLATE_CSV, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="oleoq-configuration-template.csv"',
        "Cache-Control": "no-store",
      },
    }),
);
