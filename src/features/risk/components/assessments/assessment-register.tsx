"use client";

import { ClipboardList, Download, FilePlus2, Lock, ScanLine, SlidersHorizontal } from "lucide-react";
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
import { ASSESSMENT_STATUS_LABELS, ASSESSMENT_STATUSES } from "@/lib/risk/labels";
import { RISK_BAND_LABELS, RISK_BANDS, RISK_METHOD_LABELS, RISK_METHODS } from "@/lib/risk/scoring";
import { toQueryString, useAssessments, type AssessmentListItem, type AssessmentListParams } from "../../api";
import { formatDate } from "../../format";
import { AssessmentStatusBadge, ScoreChip } from "../shared";

const PAGE_SIZE = 20;

const SORTS = [
  { id: "updatedAt", name: "Recently updated" },
  { id: "reference", name: "Reference" },
  { id: "title", name: "Title" },
  { id: "score", name: "Score" },
  { id: "reviewDate", name: "Review date" },
  { id: "status", name: "Status" },
];

/** Risk assessments register: search (reference, title, item or label id), filters, sorting, CSV. */
export function AssessmentRegister() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDeferredValue(search.trim());
  const [filters, setFilters] = useState<Omit<AssessmentListParams, "page" | "pageSize" | "q">>({
    status: (params.get("status") as AssessmentListParams["status"]) ?? "ACTIVE",
    band: (params.get("band") as AssessmentListParams["band"]) ?? undefined,
    review: (params.get("review") as AssessmentListParams["review"]) ?? undefined,
    mine: params.get("mine") === "true" ? "true" : undefined,
    sort: "updatedAt",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const lookups = useLookups();
  const structure = structureOptions(lookups.data);
  const query: AssessmentListParams = { page, pageSize: PAGE_SIZE, q: q || undefined, ...filters };
  const list = useAssessments(query);
  const set = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const exportHref = `/api/risk/assessments/export?${toQueryString({ ...query, page: undefined, pageSize: undefined })}`;
  const moreActive = [filters.departmentId, filters.ownerId, filters.review, filters.mine, filters.sort !== "updatedAt" ? "x" : undefined].filter(Boolean).length;
  const filtered = Boolean(q) || Object.entries(filters).some(([k, v]) => v && !(k === "status" && v === "ACTIVE") && k !== "sort" && k !== "dir");

  return (
    <>
      <PageHeader
        title="Risk assessments"
        description="Every assessment you can see – search, filter and open one to see its next step."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/scan">
                <ScanLine /> Scan a label
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={exportHref}>
                <Download /> Export CSV
              </a>
            </Button>
            {can(PERMISSIONS.RISK_CREATE) && (
              <Button asChild>
                <Link href="/risk/assessments/new">
                  <FilePlus2 /> New assessment
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4 gap-2 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search reference, title or item" />
          <FilterSelect
            value={filters.status === "ACTIVE" ? undefined : filters.status}
            onChange={(v) => set({ status: (v as AssessmentListParams["status"]) ?? "ACTIVE" })}
            options={[...ASSESSMENT_STATUSES.map((s) => ({ id: s, name: ASSESSMENT_STATUS_LABELS[s] })), { id: "ALL", name: "Active and archived" }]}
            allLabel="All active"
          />
          <FilterSelect value={filters.siteId ?? undefined} onChange={(v) => set({ siteId: v ?? null })} options={structure.sites} allLabel="All sites" />
          <FilterSelect
            value={filters.band}
            onChange={(v) => set({ band: v as AssessmentListParams["band"] })}
            options={[{ id: "ATTENTION", name: "High, critical or action required" }, ...RISK_BANDS.map((b) => ({ id: b, name: RISK_BAND_LABELS[b] }))]}
            allLabel="Any risk level"
          />
          <FilterSelect value={filters.method} onChange={(v) => set({ method: v as AssessmentListParams["method"] })} options={RISK_METHODS.map((m) => ({ id: m, name: RISK_METHOD_LABELS[m] }))} allLabel="Any method" />
        </div>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-fit">
              <SlidersHorizontal /> More filters{moreActive ? ` (${moreActive})` : ""}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect value={filters.departmentId ?? undefined} onChange={(v) => set({ departmentId: v ?? null })} options={structure.departments} allLabel="All departments" />
            <UserPicker value={filters.ownerId ?? null} onChange={(id) => set({ ownerId: id })} placeholder="Any responsible person" />
            <FilterSelect value={filters.review} onChange={(v) => set({ review: v as AssessmentListParams["review"] })} options={[{ id: "due", name: "Review due (incl. overdue)" }, { id: "overdue", name: "Review overdue" }]} allLabel="Any review date" />
            <FilterSelect value={filters.mine} onChange={(v) => set({ mine: v as "true" | undefined })} options={[{ id: "true", name: "I am owner, approver or participant" }]} allLabel="Everyone's" />
            <FilterSelect value={filters.sort} onChange={(v) => set({ sort: (v as AssessmentListParams["sort"]) ?? "updatedAt" })} options={SORTS} allLabel="Recently updated" />
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
          icon={ClipboardList}
          title="No assessments found"
          description={filtered ? "Try a different search or filter." : "Start with the activity that worries you most – you can save a draft at any time."}
          action={
            can(PERMISSIONS.RISK_CREATE) ? (
              <Button asChild>
                <Link href="/risk/assessments/new">
                  <FilePlus2 /> New assessment
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
                <Link href={`/risk/assessments/${a.id}`} className="block space-y-1.5 p-4 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{a.title || "Untitled draft"}</p>
                    <AssessmentStatusBadge status={a.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.reference} · {a.siteName ?? "No site"} · {a.owner?.name ?? "No owner"}
                  </p>
                  <RowFlags item={a} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Assessment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Where</TableHead>
                  <TableHead>Responsible</TableHead>
                  <TableHead className="pr-4">Review date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => router.push(`/risk/assessments/${a.id}`)}>
                    <TableCell className="max-w-80 pl-4">
                      <Link href={`/risk/assessments/${a.id}`} onClick={(e) => e.stopPropagation()} className="block">
                        <span className="flex items-center gap-1.5 truncate font-medium">
                          {a.isConfidential && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Confidential" />}
                          {a.title || "Untitled draft"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.reference} · {RISK_METHOD_LABELS[a.method]} · rev. {a.revision}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <AssessmentStatusBadge status={a.status} />
                    </TableCell>
                    <TableCell>
                      <ScoreChip score={a.score} band={a.band} method={a.method} />
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">{[a.siteName, a.departmentName].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground">{a.owner?.name ?? "—"}</TableCell>
                    <TableCell className="pr-4">
                      <span className={a.reviewOverdue ? "font-medium text-destructive" : a.reviewDue ? "font-medium text-warning" : "text-muted-foreground"}>
                        {formatDate(a.reviewDate)}
                        {a.reviewOverdue ? " · overdue" : a.reviewDue ? " · due" : ""}
                      </span>
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

function RowFlags({ item }: { item: AssessmentListItem }) {
  return (
    <div className="flex flex-wrap gap-1">
      <ScoreChip score={item.score} band={item.band} method={item.method} />
      {item.reviewOverdue && <StatusBadge tone="danger">Review overdue</StatusBadge>}
      {!item.reviewOverdue && item.reviewDue && <StatusBadge tone="warning">Review due {formatDate(item.reviewDate)}</StatusBadge>}
      {item.isConfidential && <StatusBadge tone="warning">Confidential</StatusBadge>}
    </div>
  );
}
