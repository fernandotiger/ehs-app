import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { lawContentService } from "@/server/modules/law/content.service";

/** GET /api/law/content/sample – the fictional sample update package (JSON) offered for download / preview. */
export const GET = apiHandler({ module: "law", permission: PERMISSIONS.LAW_REQUIREMENT_MANAGE }, async () => lawContentService.sample());
