"use client";

import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { CloudOff, MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAddComment, useComments } from "@/features/shared/records";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { errorMessage } from "@/lib/api-client";
import { enqueue, useOutbox } from "@/lib/offline/outbox";

/**
 * Discussion on any record. Anyone who can open the record can comment. While offline, a
 * comment is queued in the outbox ("comment.create") and posted by the Sync button – its
 * clientId keeps the replay idempotent.
 */
export function CommentsPanel({ entityType, entityId, title = "Comments" }: { entityType: string; entityId: string; title?: string }) {
  const { user } = useCurrentUser();
  const query = useComments(entityType, entityId);
  const add = useAddComment(entityType, entityId);
  const online = useOnlineStatus();
  const queued = useOutbox(user.id, "comment.create").filter((op) => op.payload.entityType === entityType && op.payload.entityId === entityId);
  const [body, setBody] = useState("");

  async function submit() {
    const text = body.trim();
    if (!text) return;
    const clientId = crypto.randomUUID();
    if (!online) {
      await enqueue({ id: clientId, type: "comment.create", payload: { entityType, entityId, body: text, clientId }, label: `Comment: ${text.slice(0, 40)}`, userId: user.id });
      setBody("");
      toast.info("You're offline – the comment will be posted when you sync.");
      return;
    }
    try {
      await add.mutateAsync({ body: text, clientId });
      setBody("");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-4 text-brand" /> {title}
        </CardTitle>
        <CardDescription>Questions and updates about this record.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <LoadingRows rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} className="py-6" />
        ) : query.data.length === 0 && queued.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {query.data.map((c) => (
              <li key={c.id} className="rounded-xl bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.author.name}</span> · {formatDistanceToNowStrict(parseISO(c.createdAt), { addSuffix: true })}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              </li>
            ))}
            {queued.map((op) => (
              <li key={op.id} className="rounded-xl border border-dashed px-3 py-2">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CloudOff className="size-3" /> Waiting to sync
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{String(op.payload.body ?? "")}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment…"
            maxLength={5000}
            rows={3}
            aria-label="New comment"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
            }}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!body.trim() || add.isPending}>
              <Send /> Post
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
