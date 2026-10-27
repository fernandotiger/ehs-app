"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface DigestLine {
  title: string;
  link?: string;
  dueDate?: string;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  /** Digest messages (scheduled jobs) list their records. */
  items: DigestLine[] | null;
  readAt: string | null;
  createdAt: string;
}

const DIGEST_PREVIEW = 4;

interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}

const KEY = ["notifications"];

/** In-app alerts (assignments, reminders, escalations, job digests with their record links). Polls every minute. */
export function NotificationBell() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => api.get<NotificationPage>("/api/notifications", { limit: 20 }, signal),
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/api/notifications", { action: "mark-all-read" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const unread = data?.unreadCount ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${unread} unread)`}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>
            <CheckCheck className="size-4" /> Mark all read
          </Button>
        </div>
        {!data?.items.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y">
              {data.items.map((n) => {
                const content = (
                  <div className={cn("flex gap-3 px-3 py-2.5 hover:bg-muted/60", !n.readAt && "bg-brand-soft/50")}>
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
                const onClick = () => !n.readAt && markRead.mutate(n.id);
                if (n.items?.length) {
                  // Digest: the message plus links to its records (no nested links).
                  return (
                    <li key={n.id} className={cn("px-3 py-2.5", !n.readAt && "bg-brand-soft/50")}>
                      <div className="flex gap-3">
                        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">{n.title}</p>
                          <ul className="mt-1 space-y-0.5">
                            {n.items.slice(0, DIGEST_PREVIEW).map((item, i) => (
                              <li key={i} className="truncate text-xs">
                                {item.link ? (
                                  <Link href={item.link} onClick={onClick} className="text-brand underline-offset-2 hover:underline">
                                    {item.title}
                                  </Link>
                                ) : (
                                  item.title
                                )}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {n.items.length > DIGEST_PREVIEW && (
                              <Link href={n.link ?? "/my-work"} onClick={onClick} className="mr-1 text-brand hover:underline">
                                +{n.items.length - DIGEST_PREVIEW} more ·
                              </Link>
                            )}
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={onClick}>
                        {content}
                      </Link>
                    ) : (
                      <button type="button" className="w-full text-left" onClick={onClick}>
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
