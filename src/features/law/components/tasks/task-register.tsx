"use client";

import { AlarmClock, CalendarClock, ListTodo, Scale, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { PageBanner } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { ALL_REGISTERS } from "@/lib/law";
import { PERMISSIONS } from "@/lib/permissions";
import { useLawSummary, useLawTasks, type LawTaskParams } from "../../api";
import { formatDate } from "../../format";
import { LawPriorityBadge, LawTaskStatusBadge } from "../shared";

const PAGE_SIZE = 20;
type Status = NonNullable<LawTaskParams["status"]>;
type Due = LawTaskParams["due"];

/** Law tasks: my work first; people who see the register can widen to everyone's tasks. */
export function LawTaskRegister() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const seesAll = can(PERMISSIONS.LAW_VIEW);
  const [view, setView] = useState<"mine" | "all">(params.get("view") === "all" && seesAll ? "all" : "mine");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState<Status>("OPEN");
  const [due, setDue] = useState<Due>(params.get("due") === "overdue" ? "overdue" : params.get("due") === "week" ? "week" : undefined);
  const [register, setRegister] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const summary = useLawSummary();
  const list = useLawTasks({ page, pageSize: PAGE_SIZE, view, status, due, register, q: q || undefined });
  const s = summary.data;
  const reset = () => setPage(1);
  const filtered = Boolean(q || due || register || status !== "OPEN");

  return (
    <>
      <PageBanner title="Law tasks" description="The work needed to close compliance gaps – who does what, by when. Finishing a task does not change a requirement's check." />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My tasks" value={s?.mine ?? "–"} hint="Still to do" icon={UserCheck} />
        <StatCard label="Overdue" value={s?.overdue ?? "–"} hint="Past the due date" icon={AlarmClock} tone={s?.overdue ? "danger" : "success"} />
        <StatCard label="Due this week" value={s?.dueSoon ?? "–"} hint="Today and the next 6 days" icon={CalendarClock} tone="warning" />
        <StatCard label="My requirements to review" value={s?.reviewsDue ?? "–"} hint="Law changed or review due soon" icon={Scale} tone="info" href="/law/requirements?mine=true" />
      </div>

      {seesAll && (
        <Tabs value={view} onValueChange={(v) => { setView(v as "mine" | "all"); reset(); }} className="mb-3">
          <TabsList>
            <TabsTrigger value="mine">Mine</TabsTrigger>
            <TabsTrigger value="all">Everyone&apos;s</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); reset(); }} placeholder="Search reference, task or details" />
          <FilterSelect
            value={status === "OPEN" ? undefined : status}
            onChange={(v) => { setStatus((v as Status | undefined) ?? "OPEN"); reset(); }}
            options={[{ id: "COMPLETED", name: "Done" }, { id: "ARCHIVED", name: "Archived" }, { id: "ALL", name: "Everything" }]}
            allLabel="To do"
            ariaLabel="Status"
          />
          <FilterSelect value={due} onChange={(v) => { setDue(v as Due); reset(); }} options={[{ id: "overdue", name: "Overdue" }, { id: "week", name: "Due this week" }]} allLabel="Any due date" ariaLabel="Due date" />
          <FilterSelect value={register} onChange={(v) => { setRegister(v); reset(); }} options={ALL_REGISTERS.map((r) => ({ id: r, name: r }))} allLabel="Any register" ariaLabel="Register" />
        </div>
      </Card>

      {list.isPending ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={filtered ? "No tasks found" : view === "mine" ? "No Law tasks for you" : "No open Law tasks"}
          description={filtered ? "Try a different search or filter." : "Tasks are added from a requirement in “Laws that apply to us”."}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {list.data.items.map((t) => (
              <li key={t.id}>
                <Link href={`/law/tasks/${t.id}`} className="block space-y-1.5 p-4 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{t.title}</p>
                    <LawTaskStatusBadge status={t.status} overdue={t.overdue} archived={t.archived} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.reference} · {t.assignedToMe ? "me" : t.owner.name} · due {formatDate(t.dueDate)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">For: {t.requirement.title}</p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Who does it</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="pr-4">Requirement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => router.push(`/law/tasks/${t.id}`)}>
                    <TableCell className="max-w-80 pl-4">
                      <Link href={`/law/tasks/${t.id}`} onClick={(e) => e.stopPropagation()} className="block">
                        <span className="block truncate font-medium">{t.title}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {t.reference} <LawPriorityBadge priority={t.priority} />
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <LawTaskStatusBadge status={t.status} overdue={t.overdue} archived={t.archived} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.assignedToMe ? "Me" : t.owner.name}</TableCell>
                    <TableCell className={t.overdue ? "font-medium text-destructive" : "text-muted-foreground"}>{formatDate(t.dueDate)}</TableCell>
                    <TableCell className="max-w-72 pr-4 text-muted-foreground">
                      <span className="block truncate">{t.requirement.title}</span>
                      <span className="block truncate text-xs">{t.profile.name}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-3">
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />
          </div>
        </Card>
      )}
    </>
  );
}
