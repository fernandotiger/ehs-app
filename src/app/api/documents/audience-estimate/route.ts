import { z } from "zod";
import { audienceSchema } from "@/lib/validation/documents";
import { apiHandler } from "@/server/http/api-handler";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentService } from "@/server/modules/documents/document.service";

const body = z.object({ audience: audienceSchema });

/** POST /api/documents/audience-estimate – live "≈ N people" count for the audience builder. */
export const POST = apiHandler({ module: "documents", permission: DOCUMENT_PERMISSIONS.MANAGE, body }, async ({ body }) => documentService.estimateAudience(body.audience));
