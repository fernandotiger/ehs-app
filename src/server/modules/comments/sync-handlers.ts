import "server-only";
import { createCommentSchema } from "@/lib/validation/evidence";
import { ValidationError } from "@/server/http/errors";
import type { SyncHandlerMap } from "@/server/modules/sync/sync.types";
import { commentService } from "./comment.service";

/** `comment.create` – a comment written while offline (clientId keeps the replay idempotent). */
export const commentSyncHandlers: SyncHandlerMap = {
  "comment.create": async (payload, ctx) => {
    const parsed = createCommentSchema.safeParse({ ...payload, clientId: payload.clientId ?? ctx.operationId });
    if (!parsed.success) throw new ValidationError("Invalid comment payload", parsed.error.issues);
    return commentService.create(ctx.user, parsed.data, ctx.meta);
  },
};
