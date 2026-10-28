import { apiHandler } from "@/server/http/api-handler";
import { lawContentService } from "@/server/modules/law/content.service";

/** GET /api/law/content – installed legal-content versions (newest first). */
export const GET = apiHandler({ module: "law" }, async ({ user }) => lawContentService.library(user));
