import { lawPackageSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawContentService } from "@/server/modules/law/content.service";

/** POST /api/law/content/preview – validate a package and list its New / Amended items (installs nothing). */
export const POST = apiHandler({ module: "law", body: lawPackageSchema }, async ({ body, user }) => lawContentService.preview(user, body.package));
