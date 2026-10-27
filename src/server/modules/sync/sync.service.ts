import "server-only";
import type { SyncOperationResult, SyncRequest } from "@/lib/offline/operations";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { AppError } from "@/server/http/errors";
import { syncHandlers } from "./sync.registry";

/**
 * Applies operations replayed from a client's offline outbox.
 *
 * Idempotent: each operation id is recorded in `sync_operations`, so a retry after a
 * dropped connection returns the original result instead of applying twice.
 */
export const syncService = {
  async apply(request: SyncRequest, user: CurrentUser, meta: RequestMeta): Promise<SyncOperationResult[]> {
    const results: SyncOperationResult[] = [];

    for (const op of request.operations) {
      const existing = await prisma.syncOperation.findUnique({ where: { id: op.id } });
      if (existing) {
        if (existing.userId !== user.id) {
          results.push({ id: op.id, status: "rejected", error: { code: "FORBIDDEN", message: "Operation id conflict" } });
        } else {
          results.push({ id: op.id, status: "duplicate", result: existing.result });
        }
        continue;
      }

      const handler = syncHandlers[op.type];
      if (!handler) {
        results.push({ id: op.id, status: "rejected", error: { code: "UNSUPPORTED", message: `Unsupported operation ${op.type}` } });
        continue;
      }

      try {
        const result = await handler(op.payload, {
          user,
          meta,
          operationId: op.id,
          clientCreatedAt: op.clientCreatedAt ? new Date(op.clientCreatedAt) : null,
        });
        const json = result === undefined ? null : JSON.parse(JSON.stringify(result));
        await prisma.syncOperation.create({
          data: { id: op.id, organizationId: user.organizationId, userId: user.id, type: op.type, status: "applied", result: json ?? undefined },
        });
        results.push({ id: op.id, status: "applied", result: json });
      } catch (error) {
        const appError = error instanceof AppError ? error : null;
        if (!appError) console.error("[sync] operation failed", op.type, error);
        results.push({
          id: op.id,
          status: "rejected",
          error: {
            code: appError?.code ?? "INTERNAL_ERROR",
            message: appError?.message ?? "The operation could not be applied",
          },
        });
      }
    }

    return results;
  },
};
