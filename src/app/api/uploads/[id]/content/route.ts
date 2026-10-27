import { apiHandler } from "@/server/http/api-handler";
import { uploadService } from "@/server/modules/uploads/upload.service";

/** PUT /api/uploads/:id/content – raw file bytes (local storage driver). */
export const PUT = apiHandler({}, async ({ req, params, user }) => uploadService.receiveContent(params.id!, user, req.body));
