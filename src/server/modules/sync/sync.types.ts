import "server-only";
import type { SyncOperationType } from "@/lib/offline/operations";
import type { CurrentUser } from "@/server/auth/current-user";
import type { RequestMeta } from "@/server/http/api-handler";

export interface SyncHandlerContext {
  user: CurrentUser;
  meta: RequestMeta;
  /** The outbox operation id – use as an idempotency key where the domain supports it. */
  operationId: string;
  clientCreatedAt: Date | null;
}

/** A module-provided handler that applies one replayed offline operation. */
export type SyncHandler = (payload: Record<string, unknown>, ctx: SyncHandlerContext) => Promise<unknown>;

export type SyncHandlerMap = Partial<Record<SyncOperationType, SyncHandler>>;
