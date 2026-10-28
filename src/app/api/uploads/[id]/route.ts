import { apiHandler } from "@/server/http/api-handler";
import { uploadService } from "@/server/modules/uploads/upload.service";

/** GET /api/uploads/:id – the caller's own uploaded, unused file (name, type, size; 404 when used / expired / not theirs). */
export const GET = apiHandler({}, async ({ params, user }) => uploadService.summary(params.id!, user));
