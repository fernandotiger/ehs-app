"use client";

import { AlarmClock, CalendarClock, ListChecks, Plus, Send, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PaginationBar } from "@/components/common/pagination-bar";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { PageBanner } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { useUrlSearchText, useUrlState, useUrlTab } from "@/hooks/use-url-state";
import { ACTION_PRIORITIES, ACTION_PRIORITY_LABELS, ACTION_STATUS_LABELS, ACTION_STATUSES } from "@/lib/actions";
import { PERMISSIONS } from "@/lib/permissions";
import { ACTION_LIST_VIEWS, actionListQuerySchema, type ActionListView } from "@/lib/validation/actions";
import { useActionList, useActionSummary, type ActionListItem, type ActionListParams } from "../api";
import { formatDate } from "../format";
import { ActionPriorityBadge, ActionStatusBadge } from "./action-badges";

const PAGE_SIZE = 20;

const VIEWS: { key: ActionListView; label: string }[] = [
  { key: "mine", label: "All mine" },
  { key: "assigned", label: "Assigned to me" },
  { key: "created", label: "Created by me" },
];

const OWN_VIEWS: readonly ActionListView[] = VIEWS.map((v) => v.key);
/** URL state (the `view` tab is read with `useUrlTab`); "Any status" is written as `status=ALL`. */
const urlSchema = actionListQuerySchema.pick({ page: true, q: true, status: true, priority: true, overdue: true });

/** My Actions: work assigned to me and actions I created for others (managers can widen to their area). */
export function MyActions() {
  const router = useRouter();
  const { can } = useCurrentUser();
  const seesAll = can(PERMISSIONS.ACTION_VIEW);
  // "Everyone's" needs action.view: a saved `view=all` falls back to "All mine" without rewriting the URL.
  const tab = useUrlTab<ActionListView>("view", "mine", seesAll ? ACTION_LIST_VIEWS : OWN_VIEWS);
  const view = tab.value;
  const [filters, set] = useUrlState(urlSchema);
  const { page, q } = filters;
  const [search, setSearch] = useUrlSearchText();
  const summary = useActionSummary();
  const list = useActionList({ ...filters, pageSize: PAGE_SIZE, view, sort: "dueDate", dir: "asc" });
  const s = summary.data;

  return (
    <>
      <PageBanner
        title="My Actions"
        description="Things to do that are not part of an incident or a risk assessment – who does what, by when."
        actions={
          can(PERMISSIONS.ACTION_CREATE) ? (
            <Button asChild variant="secondary">
              <Link href="/actions/new">
                <Plus /> Create action
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Assigned to me" value={s?.assigned ?? "–"} hint="To do or in progress" icon={UserCheck} />
        <StatCard label="Overdue" value={s?.overdue ?? "–"} hint="Past the due date" icon={AlarmClock} tone={s?.overdue ? "danger" : "success"} />
        <StatCard label="Due this week" value={s?.dueSoon ?? "–"} hint="Today and the next 6 days" icon={CalendarClock} tone="warning" />
        <StatCard label="Created for others" value={s?.createdForOthers ?? "–"} hint="Still open" icon={Send} tone="info" />
      </div>

      <Tabs {...tab} className="mb-3">
        <TabsList className="h-auto flex-wrap">
          {VIEWS.map((v) => (
            <TabsTrigger key={v.key} value={v.key}>
              {v.label}
            </TabsTrigger>
          ))}
          {seesAll && <TabsTrigger value="all">Everyone&apos;s</TabsTrigger>}
        </TabsList>
      </Tabs>
      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={setSearch} placeholder="Search reference, title or description" />
          <FilterSelect
            value={filters.status === "ALL" ? undefined : filters.status}
            onChange={(v) => set({ status: (v as ActionListParams["status"]) ?? "ALL" })}
            options={[{ id: "ACTIVE", name: "Open work (to do or in progress)" }, ...ACTION_STATUSES.map((st) => ({ id: st, name: ACTION_STATUS_LABELS[st] }))]}
            allLabel="Any status"
            ariaLabel="Status"
          />
          <FilterSelect value={filters.priority} onChange={(v) => set({ priority: v as ActionListParams["priority"] })} options={ACTION_PRIORITIES.map((p) => ({ id: p, name: ACTION_PRIORITY_LABELS[p] }))} allLabel="Any priority" ariaLabel="Priority" />
          <FilterSelect value={filters.overdue} onChange={(v) => set({ overdue: v as "true" | undefined })} options={[{ id: "true", name: "Overdue only" }]} allLabel="Any due date" ariaLabel="Due date" />
        </div>
      </Card>

      {list.isPending ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={q || filters.overdue || filters.priority ? "No actions found" : view === "created" ? "You have not created any open actions" : "Nothing to do right now"}
          description={q || filters.overdue || filters.priority ? "Try a different search or filter." : "When someone gives you an action it appears here."}
          action={
            can(PERMISSIONS.ACTION_CREATE) && !q ? (
              <Button asChild>
                <Link href="/actions/new">
                  <Plus /> Create action
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {list.data.items.map((a) => (
              <li key={a.id}>
                <Link href={`/actions/${a.id}`} className="block space-y-1.5 p-4 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{a.title}</p>
                    <ActionStatusBadge status={a.status} overdue={a.overdue} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.reference} · {who(a)} · due {formatDate(a.dueDate)}
                  </p>
                  <ActionPriorityBadge priority={a.priority} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Who does it</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="pr-4">Where</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => router.push(`/actions/${a.id}`)}>
                    <TableCell className="max-w-96 pl-4">
                      <Link href={`/actions/${a.id}`} onClick={(e) => e.stopPropagation()} className="block">
                        <span className="block truncate font-medium">{a.title}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {a.reference}
                          {!a.createdByMe ? ` · from ${a.createdBy.name}` : ""}
                          <ActionPriorityBadge priority={a.priority} />
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ActionStatusBadge status={a.status} overdue={a.overdue} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.assignedToMe ? "Me" : a.owner.name}</TableCell>
                    <TableCell className={a.overdue ? "font-medium text-destructive" : "text-muted-foreground"}>{formatDate(a.dueDate)}</TableCell>
                    <TableCell className="max-w-60 truncate pr-4 text-muted-foreground">{a.placeLabel ?? "Whole company"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-3">
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(p) => set({ page: p })} />
          </div>
        </Card>
      )}
    </>
  );
}

function who(a: ActionListItem): string {
  if (a.assignedToMe) return a.createdByMe ? "for me" : `from ${a.createdBy.name}`;
  return `for ${a.owner.name}`;
}
