import { initUploadSchema } from "@/lib/validation/uploads";
import { apiHandler } from "@/server/http/api-handler";
import { uploadService } from "@/server/modules/uploads/upload.service";

/** POST /api/uploads – reserve an upload slot and get upload instructions. */
export const POST = apiHandler({ body: initUploadSchema }, async ({ body, user }) => uploadService.init(body, user));
