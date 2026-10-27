"use client";

import { format } from "date-fns";
import { AlertTriangle, BookOpenCheck, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Inbox, ShieldAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/common/stat-card";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMyWork, type MyWorkItemDto } from "@/features/jobs/api";
import { cn } from "@/lib/utils";

const MODULE_ICONS: Record<string, LucideIcon> = { documents: BookOpenCheck, incidents: AlertTriangle, risk: ShieldAlert };

const GROUPS = [
  { key: "overdue", title: "Overdue", description: "Past its due date – please deal with these first." },
  { key: "week", title: "Due this week", description: "Due today or in the next six days." },
  { key: "later", title: "Later", description: "Coming up after this week." },
] as const;

function dueLabel(item: MyWorkItemDto): string {
  if (item.daysOverdue > 0) return `Overdue by ${item.daysOverdue} day${item.daysOverdue === 1 ? "" : "s"}`;
  if (item.daysOverdue === 0) return "Due today";
  if (item.daysOverdue === -1) return "Due tomorrow";
  return `Due ${format(new Date(`${item.dueDate}T00:00:00`), "EEE d MMM yyyy")}`;
}

export function MyWorkRow({ item }: { item: MyWorkItemDto }) {
  const Icon = MODULE_ICONS[item.module] ?? ClipboardList;
  return (
    <Link href={item.href} className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/50">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", item.group === "overdue" ? "bg-destructive/10 text-destructive" : "bg-brand-soft text-brand")}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{[item.reference, item.kindLabel, dueLabel(item)].filter(Boolean).join(" · ")}</span>
      </span>
      {item.role === "reviewer" && <StatusBadge tone="info">To review</StatusBadge>}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/**
 * My work – one inbox of everything assigned to the signed-in person (owner or reviewer) from
 * every module's due-work provider, grouped Overdue / Due this week / Later.
 */
export function MyWork() {
  const work = useMyWork();
  const counts = work.data?.counts;

  return (
    <>
      <PageBanner title="My work" description="Everything waiting for you, in one place." />
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Overdue" value={counts?.overdue ?? "–"} icon={AlertTriangle} tone={counts?.overdue ? "danger" : "brand"} />
          <StatCard label="Due this week" value={counts?.week ?? "–"} icon={CalendarClock} />
          <StatCard label="Later" value={counts?.later ?? "–"} icon={Inbox} />
        </div>
        {work.isPending ? (
          <LoadingRows rows={5} />
        ) : work.isError ? (
          <ErrorState error={work.error} onRetry={() => work.refetch()} />
        ) : work.data.items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="size-8 text-success" />
              <p className="font-medium">You&apos;re all caught up</p>
              <p className="text-sm text-muted-foreground">Work assigned to you – documents to acknowledge, actions, reviews – appears here.</p>
            </CardContent>
          </Card>
        ) : (
          GROUPS.filter((g) => work.data.items.some((i) => i.group === g.key)).map((group) => (
            <Card key={group.key}>
              <CardHeader>
                <CardTitle className={cn(group.key === "overdue" && "text-destructive")}>
                  {group.title} ({work.data.counts[group.key]})
                </CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="-mx-2 divide-y">
                  {work.data.items
                    .filter((i) => i.group === group.key)
                    .map((item) => (
                      <li key={`${item.provider}-${item.entityId}`}>
                        <MyWorkRow item={item} />
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          ))
        )}
        {work.data?.unavailable.length ? <p className="text-xs text-muted-foreground">Could not load: {work.data.unavailable.join(", ")}. Try again later.</p> : null}
      </div>
    </>
  );
}

/** Home: the five most urgent items. */
export function MyWorkWidget() {
  const work = useMyWork();
  const top = work.data?.items.slice(0, 5) ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="size-4 text-brand" /> My work
          </CardTitle>
          <CardDescription>
            {work.data ? `${work.data.counts.overdue} overdue · ${work.data.counts.week} due this week · ${work.data.counts.later} later` : "What is waiting for you"}
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/my-work">See all</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {work.isPending ? (
          <LoadingRows rows={3} />
        ) : work.isError ? (
          <ErrorState error={work.error} onRetry={() => work.refetch()} className="py-6" />
        ) : top.length === 0 ? (
          <p className="rounded-xl bg-success/10 px-4 py-6 text-center text-sm text-success">You&apos;re all caught up.</p>
        ) : (
          <ul className="-mx-2 divide-y">
            {top.map((item) => (
              <li key={`${item.provider}-${item.entityId}`}>
                <MyWorkRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
