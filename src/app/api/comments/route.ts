import { createCommentSchema, entityRefSchema } from "@/lib/validation/evidence";
import { apiHandler } from "@/server/http/api-handler";
import { commentService } from "@/server/modules/comments/comment.service";

/** GET /api/comments?entityType&entityId – discussion on a record (oldest first). */
export const GET = apiHandler({ query: entityRefSchema }, async ({ query, user }) => commentService.list(user, query.entityType, query.entityId));

/** POST /api/comments – { entityType, entityId, body, clientId? } */
export const POST = apiHandler({ body: createCommentSchema }, async ({ body, user, meta }) => commentService.create(user, body, meta));
