"use client";

import { Download, ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import { ACTION_KIND_LABELS, ACTION_KINDS, ACTION_STATE_LABELS, ACTION_STATES, PRIORITY_LABELS } from "@/lib/incidents";
import { PERMISSIONS } from "@/lib/permissions";
import { toQueryString, useActions, useTasks, type ActionListParams } from "../../api";
import { formatDate } from "../../format";
import { ActionStateBadge } from "../shared";
import { ActionFormSheet } from "./action-form-sheet";

const PAGE_SIZE = 20;
type View = "actions" | "tasks";

/** Actions register with a Tasks tab (child tasks of actions). */
export function ActionRegister() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const view: View = params.get("view") === "tasks" ? "tasks" : "actions";
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [filters, setFilters] = useState<Omit<ActionListParams, "page" | "pageSize" | "q" | "view">>({
    state: (params.get("state") as ActionListParams["state"]) ?? "ACTIVE",
    mine: params.get("mine") === "true" ? "true" : undefined,
    overdue: params.get("overdue") === "true" ? "true" : undefined,
    done: "false",
    sort: "dueDate",
    dir: "asc",
  });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const structure = structureOptions(useLookups().data);
  const query: ActionListParams = { page, pageSize: PAGE_SIZE, q: q || undefined, view, ...filters };
  const actions = useActions(query, view === "actions");
  const tasks = useTasks(query);
  const set = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Actions"
        description="Corrective and preventive actions and their tasks – who does what, by when, and whether it worked."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/incidents/actions/export?${toQueryString({ ...query, page: undefined, pageSize: undefined, view: undefined, done: undefined })}`}>
                <Download /> Export CSV
              </a>
            </Button>
            {can(PERMISSIONS.INCIDENT_ACTION_CREATE) && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Preventive action
              </Button>
            )}
          </>
        }
      />
      <Tabs value={view} onValueChange={(v) => { router.replace(`${pathname}${v === "tasks" ? "?view=tasks" : ""}`, { scroll: false }); setPage(1); }} className="mb-3">
        <TabsList>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={view === "tasks" ? "Search tasks or action reference" : "Search reference, description or incident"} />
          {view === "actions" ? (
            <FilterSelect
              value={filters.state}
              onChange={(v) => set({ state: v as ActionListParams["state"] })}
              options={[{ id: "ACTIVE", name: "Not yet effective (open work)" }, ...ACTION_STATES.map((s) => ({ id: s, name: ACTION_STATE_LABELS[s] }))]}
              allLabel="All states"
            />
          ) : (
            <FilterSelect value={filters.done} onChange={(v) => set({ done: v as "true" | "false" | undefined })} options={[{ id: "false", name: "Open tasks" }, { id: "true", name: "Done tasks" }]} allLabel="All tasks" />
          )}
          <FilterSelect value={filters.siteId ?? undefined} onChange={(v) => set({ siteId: v ?? null })} options={structure.sites} allLabel="All sites" />
          <FilterSelect
            value={filters.mine === "true" ? "mine" : filters.overdue === "true" ? "overdue" : undefined}
            onChange={(v) => set({ mine: v === "mine" ? "true" : undefined, overdue: v === "overdue" ? "true" : undefined })}
            options={[{ id: "mine", name: view === "tasks" ? "My tasks" : "Mine (owner or reviewer)" }, { id: "overdue", name: "Overdue" }]}
            allLabel="Everyone's"
          />
          {view === "actions" && <FilterSelect value={filters.kind} onChange={(v) => set({ kind: v as ActionListParams["kind"] })} options={ACTION_KINDS.map((k) => ({ id: k, name: ACTION_KIND_LABELS[k] }))} allLabel="Corrective and preventive" />}
        </div>
      </Card>

      {view === "actions" ? (
        actions.isPending ? (
          <LoadingRows rows={6} className="[&>*]:h-16" />
        ) : actions.isError ? (
          <ErrorState error={actions.error} onRetry={() => actions.refetch()} />
        ) : actions.data.items.length === 0 ? (
          <EmptyState icon={ListChecks} title="No actions found" description="Actions are added from an incident, from trends, or from audits, inspections and legal checks." />
        ) : (
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y md:hidden">
              {actions.data.items.map((a) => (
                <li key={a.id}>
                  <Link href={`/incidents/actions/${a.id}`} className="block space-y-1.5 p-4 hover:bg-muted/50">
                    <p className="font-medium leading-snug">{a.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.reference} · {a.owner.name} · due {formatDate(a.dueDate)}
                    </p>
                    <ActionStateBadge state={a.state} overdue={a.overdue} />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Action</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead className="pr-4">Linked to</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.data.items.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => router.push(`/incidents/actions/${a.id}`)}>
                      <TableCell className="max-w-96 pl-4">
                        <Link href={`/incidents/actions/${a.id}`} onClick={(e) => e.stopPropagation()} className="block">
                          <span className="block truncate font-medium">{a.description}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.reference} · {ACTION_KIND_LABELS[a.kind]} · {PRIORITY_LABELS[a.priority]}
                            {a.parentActionId ? " · follow-up" : ""}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ActionStateBadge state={a.state} overdue={a.overdue} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.owner.name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.state === "AWAITING_EFFECTIVENESS" ? `Review ${formatDate(a.plannedReviewDate)}` : formatDate(a.dueDate)}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{a.taskCount ? `${a.tasksDone}/${a.taskCount}` : "—"}</TableCell>
                      <TableCell className="max-w-48 truncate pr-4 text-muted-foreground">
                        {a.source ? a.source.label : a.incidentCount ? `${a.incidentCount} incident${a.incidentCount === 1 ? "" : "s"}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t px-3">
              <PaginationBar page={page} pageSize={PAGE_SIZE} total={actions.data.total} onPageChange={setPage} />
            </div>
          </Card>
        )
      ) : tasks.isPending ? (
        <LoadingRows rows={6} className="[&>*]:h-14" />
      ) : tasks.isError ? (
        <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
      ) : tasks.data.items.length === 0 ? (
        <EmptyState icon={ListChecks} title="No tasks found" description="Tasks are added on an action when the work is split between people." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {tasks.data.items.map((t) => (
              <li key={t.id}>
                <Link href={`/incidents/actions/${t.action.id}`} className="flex flex-col gap-1 p-4 hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className={t.done ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.action.reference} · {t.action.description}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{t.owner.name}</span>
                  <span className={t.overdue ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>due {formatDate(t.dueDate)}</span>
                  <StatusBadge tone={t.done ? "success" : t.overdue ? "danger" : "info"}>{t.done ? "Done" : t.overdue ? "Overdue" : "Open"}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t px-3">
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={tasks.data.total} onPageChange={setPage} />
          </div>
        </Card>
      )}
      <ActionFormSheet
        open={creating}
        onOpenChange={setCreating}
        config={{ mode: "create", incidentIds: [], kind: "PREVENTIVE", title: "Add a preventive action" }}
        onSaved={(id) => router.push(`/incidents/actions/${id}`)}
      />
    </>
  );
}
