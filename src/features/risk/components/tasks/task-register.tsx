"use client";

import { ListChecks, Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { UserPicker } from "@/components/common/user-picker";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import { PERMISSIONS } from "@/lib/permissions";
import { TASK_KIND_LABELS, TASK_KIND_SHORT, TASK_KINDS, TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/risk/labels";
import { useRiskTasks, type TaskListParams } from "../../api";
import { formatDate } from "../../format";
import { TaskStatusBadge } from "../shared";
import { TaskFormSheet } from "./task-form-sheet";

const PAGE_SIZE = 20;

/** Risk tasks register (RA and MP tasks, sub-tasks included). */
export function TaskRegister() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDeferredValue(search.trim());
  const [filters, setFilters] = useState<Omit<TaskListParams, "page" | "pageSize" | "q">>({
    status: (params.get("status") as TaskListParams["status"]) ?? "ACTIVE",
    overdue: params.get("overdue") === "true" ? "true" : undefined,
    mine: params.get("mine") === "true" ? "true" : undefined,
    sort: "dueDate",
    dir: "asc",
  });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const structure = structureOptions(useLookups().data);
  const list = useRiskTasks({ page, pageSize: PAGE_SIZE, q: q || undefined, ...filters });
  const set = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const moreActive = [filters.ownerId, filters.mine, filters.topLevel].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Risk tasks"
        description="Improvement work on assessments (RA) and management programmes (MP). Sub-tasks are listed too."
        actions={
          can(PERMISSIONS.RISK_TASK_CREATE) ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New task
            </Button>
          ) : undefined
        }
      />
      <Card className="mb-4 gap-2 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search reference or title" />
          <FilterSelect
            value={filters.status}
            onChange={(v) => set({ status: v as TaskListParams["status"] })}
            options={[{ id: "ACTIVE", name: "Open or in progress" }, ...TASK_STATUSES.map((s) => ({ id: s, name: TASK_STATUS_LABELS[s] }))]}
            allLabel="Any status"
          />
          <FilterSelect value={filters.kind} onChange={(v) => set({ kind: v as TaskListParams["kind"] })} options={TASK_KINDS.map((k) => ({ id: k, name: TASK_KIND_LABELS[k] }))} allLabel="RA and MP" />
          <FilterSelect value={filters.siteId ?? undefined} onChange={(v) => set({ siteId: v ?? null })} options={structure.sites} allLabel="All sites" />
          <FilterSelect value={filters.overdue} onChange={(v) => set({ overdue: v as "true" | undefined })} options={[{ id: "true", name: "Overdue only" }]} allLabel="Any due date" />
        </div>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-fit">
              <SlidersHorizontal /> More filters{moreActive ? ` (${moreActive})` : ""}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-4">
            <UserPicker value={filters.ownerId ?? null} onChange={(id) => set({ ownerId: id })} placeholder="Any responsible person" />
            <FilterSelect value={filters.mine} onChange={(v) => set({ mine: v as "true" | undefined })} options={[{ id: "true", name: "Only my tasks" }]} allLabel="Everyone's" />
            <FilterSelect value={filters.topLevel} onChange={(v) => set({ topLevel: v as "true" | undefined })} options={[{ id: "true", name: "Hide sub-tasks" }]} allLabel="Tasks and sub-tasks" />
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {list.isPending ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={ListChecks} title="No tasks found" description={q ? "Try a different search or filter." : "Tasks are raised from an assessment's Tasks tab or a management programme."} />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {list.data.items.map((t) => (
              <li key={t.id}>
                <Link href={`/risk/tasks/${t.id}`} className="block space-y-1.5 p-4 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{t.title}</p>
                    <TaskStatusBadge status={t.status} overdue={t.overdue} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.reference} · {TASK_KIND_SHORT[t.kind]} · {t.owner.name} · due {formatDate(t.dueDate)}
                    {t.parentReference ? ` · sub-task of ${t.parentReference}` : ""}
                  </p>
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
                  <TableHead>Responsible</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Assessment / programme</TableHead>
                  <TableHead className="pr-4">Sub-tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => router.push(`/risk/tasks/${t.id}`)}>
                    <TableCell className="max-w-80 pl-4">
                      <Link href={`/risk/tasks/${t.id}`} onClick={(e) => e.stopPropagation()} className="block">
                        <span className="block truncate font-medium">{t.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t.reference} · {TASK_KIND_LABELS[t.kind]}
                          {t.parentReference ? ` · sub-task of ${t.parentReference}` : ""}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <TaskStatusBadge status={t.status} overdue={t.overdue} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.owner.name}</TableCell>
                    <TableCell className={t.overdue ? "font-medium text-destructive" : "text-muted-foreground"}>{formatDate(t.dueDate)}</TableCell>
                    <TableCell className="max-w-60 truncate text-muted-foreground">{t.assessment ? `${t.assessment.reference} · ${t.hazard?.name ?? ""}` : t.programme.title}</TableCell>
                    <TableCell className="pr-4">{t.subTaskCount ? <StatusBadge tone={t.openSubTasks ? "warning" : "success"}>{`${t.subTaskCount - t.openSubTasks}/${t.subTaskCount} done`}</StatusBadge> : <span className="text-muted-foreground">—</span>}</TableCell>
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
      <TaskFormSheet open={creating} onOpenChange={setCreating} config={{ mode: "create" }} onSaved={(id) => router.push(`/risk/tasks/${id}`)} />
    </>
  );
}
