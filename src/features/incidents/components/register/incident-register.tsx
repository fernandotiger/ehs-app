"use client";

import { formatDistanceToNow } from "date-fns";
import { CloudUpload, Download, FilePlus2, Lock, RotateCcw, SlidersHorizontal, Trash2, TriangleAlert } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUSES, INVESTIGATION_STATUS_LABELS, SEVERITIES, SEVERITY_LABELS } from "@/lib/incidents";
import { discardOperation, retryOperation, useOutbox } from "@/lib/offline/outbox";
import { PERMISSIONS } from "@/lib/permissions";
import { toQueryString, useIncidents, useIncidentTypes, type IncidentListItem, type IncidentListParams } from "../../api";
import { formatDate } from "../../format";
import { IncidentStatusBadge, SeverityBadge } from "../shared";

const PAGE_SIZE = 20;
type View = "incidents" | "investigations";

const SORTS = [
  { id: "occurredAt", name: "Newest event first" },
  { id: "updatedAt", name: "Recently updated" },
  { id: "reference", name: "Reference" },
  { id: "targetDate", name: "Investigation target date" },
  { id: "severity", name: "Severity" },
  { id: "status", name: "Status" },
];

/** Reports queued offline for this user – shown until the header Sync button sends them. */
export function PendingReports() {
  const { user } = useCurrentUser();
  const queued = useOutbox(user.id, "incident.report");
  if (!queued.length) return null;
  return (
    <section className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-3" aria-label="Reports waiting to sync">
      <p className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold">
        <CloudUpload className="size-4 text-warning" /> Waiting to sync ({queued.length})
      </p>
      <ul className="space-y-2">
        {queued.map((op) => {
          const payload = op.payload as { title?: string; submit?: boolean };
          return (
            <li key={op.id} className="flex items-center gap-3 rounded-lg bg-card px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{payload.title || op.label}</p>
                <p className="text-xs text-muted-foreground">
                  {payload.submit ? "Report" : "Draft"} · saved {formatDistanceToNow(op.createdAt, { addSuffix: true })}
                  {op.fileIds.length ? ` · ${op.fileIds.length} file${op.fileIds.length === 1 ? "" : "s"}` : ""}
                </p>
                {op.status === "failed" && op.error && <p className="mt-1 text-xs text-destructive">{op.error}</p>}
              </div>
              <StatusBadge tone={op.status === "failed" ? "danger" : "warning"} dot>
                {op.status === "failed" ? "Needs attention" : op.status === "syncing" ? "Syncing…" : "Pending sync"}
              </StatusBadge>
              {op.status === "failed" && (
                <Button size="icon" variant="ghost" className="size-9" aria-label="Retry" onClick={() => retryOperation(op.id)}>
                  <RotateCcw />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="size-9 text-muted-foreground" aria-label="Discard" onClick={() => discardOperation(op.id)}>
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Incidents register with an Investigations tab: search (incl. searchable answers), filters, sorting, CSV. */
export function IncidentRegister() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const view: View = params.get("view") === "investigations" ? "investigations" : "incidents";
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDeferredValue(search.trim());
  const [filters, setFilters] = useState<Omit<IncidentListParams, "page" | "pageSize" | "q" | "view">>({
    status: (params.get("status") as IncidentListParams["status"]) ?? undefined,
    investigationStatus: (params.get("investigationStatus") as IncidentListParams["investigationStatus"]) ?? undefined,
    mine: params.get("mine") === "true" ? "true" : undefined,
    archived: "active",
    sort: "occurredAt",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const lookups = useLookups();
  const types = useIncidentTypes(true);
  const structure = structureOptions(lookups.data);
  const query: IncidentListParams = { page, pageSize: PAGE_SIZE, q: q || undefined, view, ...filters };
  const list = useIncidents(query);
  const set = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const type = types.data?.find((t) => t.id === filters.typeId);
  const exportHref = `/api/incidents/export?${toQueryString({ ...query, page: undefined, pageSize: undefined })}`;
  const moreActive = [filters.subtypeId, filters.departmentId, filters.from, filters.to, filters.mine, filters.archived !== "active" ? "x" : undefined].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Every report you can see – search, filter and open one to see its next step."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={exportHref}>
                <Download /> Export CSV
              </a>
            </Button>
            {can(PERMISSIONS.INCIDENT_CREATE) && (
              <Button asChild>
                <Link href="/incidents/new">
                  <FilePlus2 /> Report incident
                </Link>
              </Button>
            )}
          </>
        }
      />
      <PendingReports />
      <Tabs value={view} onValueChange={(v) => { router.replace(`${pathname}${v === "investigations" ? "?view=investigations" : ""}`, { scroll: false }); setPage(1); }} className="mb-3">
        <TabsList>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="investigations">Investigations</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="mb-4 gap-2 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search reference, title or answers" />
          {view === "investigations" ? (
            <FilterSelect
              value={filters.investigationStatus}
              onChange={(v) => set({ investigationStatus: v as IncidentListParams["investigationStatus"] })}
              options={[
                { id: "IN_PROGRESS", name: INVESTIGATION_STATUS_LABELS.IN_PROGRESS },
                { id: "COMPLETED", name: INVESTIGATION_STATUS_LABELS.COMPLETED },
                { id: "OVERDUE", name: "Overdue" },
              ]}
              allLabel="Any investigation status"
            />
          ) : (
            <FilterSelect
              value={filters.status}
              onChange={(v) => set({ status: v as IncidentListParams["status"] })}
              options={[{ id: "ACTIVE_WORK", name: "Needs work (not draft/closed)" }, ...INCIDENT_STATUSES.map((s) => ({ id: s, name: INCIDENT_STATUS_LABELS[s] }))]}
              allLabel="All statuses"
            />
          )}
          <FilterSelect value={filters.typeId ?? undefined} onChange={(v) => set({ typeId: v ?? null, subtypeId: null })} options={(types.data ?? []).map((t) => ({ id: t.id, name: t.name }))} allLabel="All types" />
          <FilterSelect value={filters.siteId ?? undefined} onChange={(v) => set({ siteId: v ?? null })} options={structure.sites} allLabel="All sites" />
          <FilterSelect value={filters.severity} onChange={(v) => set({ severity: v as IncidentListParams["severity"] })} options={SEVERITIES.map((s) => ({ id: s, name: SEVERITY_LABELS[s] }))} allLabel="Any severity" />
        </div>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-fit">
              <SlidersHorizontal /> More filters{moreActive ? ` (${moreActive})` : ""}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect value={filters.subtypeId ?? undefined} onChange={(v) => set({ subtypeId: v ?? null })} options={(type?.subtypes ?? []).map((s) => ({ id: s.id, name: s.name }))} allLabel={type ? "All subtypes" : "Choose a type for subtypes"} />
            <FilterSelect value={filters.departmentId ?? undefined} onChange={(v) => set({ departmentId: v ?? null })} options={structure.departments} allLabel="All departments" />
            <label className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 text-muted-foreground">From</span>
              <Input type="date" value={filters.from ?? ""} onChange={(e) => set({ from: e.target.value || null })} className="h-9" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 text-muted-foreground">To</span>
              <Input type="date" value={filters.to ?? ""} onChange={(e) => set({ to: e.target.value || null })} className="h-9" />
            </label>
            <FilterSelect value={filters.mine} onChange={(v) => set({ mine: v as "true" | undefined })} options={[{ id: "true", name: "Reported by me or assigned to me" }]} allLabel="Everyone's" />
            <FilterSelect
              value={filters.archived === "active" ? undefined : filters.archived}
              onChange={(v) => set({ archived: (v as "archived" | "all" | undefined) ?? "active" })}
              options={[{ id: "archived", name: "Archived only" }, { id: "all", name: "Active and archived" }]}
              allLabel="Not archived"
            />
            <FilterSelect value={filters.sort} onChange={(v) => set({ sort: (v as IncidentListParams["sort"]) ?? "occurredAt" })} options={SORTS} allLabel="Newest event first" />
            <FilterSelect value={filters.dir} onChange={(v) => set({ dir: (v as "asc" | "desc") ?? "desc" })} options={[{ id: "asc", name: "Ascending" }, { id: "desc", name: "Descending" }]} allLabel="Descending" />
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {list.isPending ? (
        <LoadingRows rows={6} className="[&>*]:h-16" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={TriangleAlert}
          title={view === "investigations" ? "No investigations found" : "No incidents found"}
          description={q || Object.values(filters).some((v) => v && v !== "active" && v !== "occurredAt" && v !== "desc") ? "Try a different search or filter." : "When something happens, report it – it only takes a minute."}
          action={
            can(PERMISSIONS.INCIDENT_CREATE) ? (
              <Button asChild>
                <Link href="/incidents/new">
                  <FilePlus2 /> Report incident
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {list.data.items.map((i) => (
              <li key={i.id}>
                <Link href={`/incidents/${i.id}`} className="block space-y-1.5 p-4 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{i.title || "Untitled draft"}</p>
                    <IncidentStatusBadge status={i.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {i.reference} · {i.typeLabel} · {formatDate(i.occurredAt)} · {i.siteName ?? "No site"}
                  </p>
                  <RowFlags item={i} view={view} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Incident</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Occurred</TableHead>
                  <TableHead>Where</TableHead>
                  {view === "investigations" ? <TableHead>Investigation</TableHead> : <TableHead>Investigators</TableHead>}
                  <TableHead className="pr-4">{view === "investigations" ? "Target date" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => router.push(`/incidents/${i.id}`)}>
                    <TableCell className="max-w-80 pl-4">
                      <Link href={`/incidents/${i.id}`} onClick={(e) => e.stopPropagation()} className="block">
                        <span className="flex items-center gap-1.5 truncate font-medium">
                          {i.isConfidential && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Confidential" />}
                          {i.title || "Untitled draft"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {i.reference} · {[i.typeLabel, i.subtypeLabel].filter(Boolean).join(" · ")}
                          {i.archived ? " · archived" : ""}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <IncidentStatusBadge status={i.status} />
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={i.severity} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(i.occurredAt)}</TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">{[i.siteName, i.departmentName].filter(Boolean).join(" · ") || "—"}</TableCell>
                    {view === "investigations" ? (
                      <TableCell>{i.investigationStatus ? <StatusBadge tone={i.investigationStatus === "COMPLETED" ? "success" : "purple"}>{INVESTIGATION_STATUS_LABELS[i.investigationStatus]}</StatusBadge> : "—"}</TableCell>
                    ) : (
                      <TableCell className="max-w-40 truncate text-muted-foreground">{i.investigators.map((x) => x.name).join(", ") || "—"}</TableCell>
                    )}
                    <TableCell className="pr-4">
                      {view === "investigations" ? (
                        <span className={i.investigationOverdue ? "font-medium text-destructive" : "text-muted-foreground"}>
                          {formatDate(i.investigationTargetDate)}
                          {i.investigationOverdue ? " · overdue" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{i.totalActions ? `${i.openActions} open / ${i.totalActions}` : "—"}</span>
                      )}
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

function RowFlags({ item, view }: { item: IncidentListItem; view: View }) {
  return (
    <div className="flex flex-wrap gap-1">
      <SeverityBadge severity={item.severity} />
      {item.isConfidential && <StatusBadge tone="warning">Confidential</StatusBadge>}
      {item.investigationOverdue && <StatusBadge tone="danger">Investigation overdue</StatusBadge>}
      {view === "incidents" && item.openActions > 0 && <StatusBadge tone="brand">{item.openActions} open action{item.openActions === 1 ? "" : "s"}</StatusBadge>}
      {item.archived && <StatusBadge>Archived</StatusBadge>}
    </div>
  );
}
