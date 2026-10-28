import { lawPackageSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawContentService } from "@/server/modules/law/content.service";

/** POST /api/law/content/install – install a valid package as the new library version (profiles keep their version). */
export const POST = apiHandler({ module: "law", body: lawPackageSchema }, async ({ body, user, meta }) => lawContentService.install(user, body.package, meta));
