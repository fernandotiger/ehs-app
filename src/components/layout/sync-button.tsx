"use client";

import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CloudOff, CloudUpload, RefreshCw, RotateCcw, Trash2, Wifi } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { discardOperation, retryOperation, useOutbox } from "@/lib/offline/outbox";
import { syncNow } from "@/lib/offline/sync-engine";
import { cn } from "@/lib/utils";

/**
 * Connectivity indicator + manual "Sync" control.
 * Shows queued offline work and replays it against the API on demand.
 */
export function SyncButton() {
  const { user } = useCurrentUser();
  const online = useOnlineStatus();
  const outbox = useOutbox(user.id);
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const pending = outbox.filter((o) => o.status !== "failed").length;
  const failed = outbox.filter((o) => o.status === "failed").length;

  async function handleSync() {
    if (!online) {
      toast.warning("You are offline. Connect to the internet to sync.");
      return;
    }
    setSyncing(true);
    try {
      const summary = await syncNow(user.id);
      await queryClient.invalidateQueries();
      if (summary.offline) toast.warning("Connection lost during sync. Remaining items are still queued.");
      else if (summary.rejected) toast.error(`${summary.applied} synced, ${summary.rejected} need attention.`);
      else if (summary.applied) toast.success(`${summary.applied} item${summary.applied === 1 ? "" : "s"} synced.`);
      else toast.success("Everything is up to date.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative gap-2 px-2.5" aria-label="Sync status">
          {online ? <Wifi className="size-4 text-success" /> : <CloudOff className="size-4 text-warning" />}
          <span className="hidden text-xs font-medium sm:inline">{online ? "Online" : "Offline"}</span>
          {outbox.length > 0 && (
            <Badge className={cn("h-5 min-w-5 px-1.5 text-[10px]", failed ? "bg-destructive" : "bg-warning text-warning-foreground")}>
              {outbox.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <p className="text-sm font-semibold">Offline sync</p>
            <p className="text-xs text-muted-foreground">
              {online ? "Connected" : "Working offline"} · {pending} pending{failed ? ` · ${failed} failed` : ""}
            </p>
          </div>
          <Button size="sm" onClick={handleSync} disabled={syncing || !online}>
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
            Sync
          </Button>
        </div>
        {outbox.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <CloudUpload className="size-6" />
            Nothing waiting to sync.
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <ul className="divide-y">
              {outbox.map((op) => (
                <li key={op.id} className="flex items-start gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{op.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Queued {formatDistanceToNow(op.createdAt, { addSuffix: true })}
                    </p>
                    {op.status === "failed" && <p className="mt-1 text-xs text-destructive">{op.error}</p>}
                  </div>
                  {op.status === "failed" && (
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => retryOperation(op.id)} aria-label="Retry">
                      <RotateCcw className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground"
                    onClick={() => discardOperation(op.id)}
                    aria-label="Discard"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
