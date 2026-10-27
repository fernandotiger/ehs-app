import { apiHandler } from "@/server/http/api-handler";
import { uploadService } from "@/server/modules/uploads/upload.service";

/** POST /api/uploads/:id/complete – verify the uploaded object. */
export const POST = apiHandler({}, async ({ params, user }) => uploadService.complete(params.id!, user));
