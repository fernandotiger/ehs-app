"use client";

import { AlertTriangle, CheckCircle2, Download, UserCheck, Users } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import type { AckReportStatus } from "@/lib/validation/documents";
import { acknowledgementExportUrl, useAcknowledgementReport, useDocumentCompliance, type AckReportRow, type ManageDocumentDto } from "../../api";
import { formatDate, formatDateTime } from "../../format";
import { ComplianceProgress } from "../compliance-progress";
import { FilterSelect, SearchBox } from "../filters";

const PAGE_SIZE = 20;

function SourceBadge({ source }: { source: string }) {
  return source === "OFFLINE_SYNC" ? (
    <StatusBadge tone="info" className="h-5">
      Offline sync
    </StatusBadge>
  ) : (
    <StatusBadge className="h-5">Online</StatusBadge>
  );
}

function StatusCell({ row }: { row: AckReportRow }) {
  if (row.acknowledgement) {
    return (
      <div>
        <p>{formatDateTime(row.acknowledgement.acknowledgedAt)}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Version {row.acknowledgement.versionNumber} <SourceBadge source={row.acknowledgement.source} />
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className={row.overdue ? "font-medium text-destructive" : undefined}>{row.overdue ? `Overdue since ${formatDate(row.dueAt)}` : `Due ${formatDate(row.dueAt)}`}</p>
      <p className="text-xs text-muted-foreground">
        {row.remindersSent ? `${row.remindersSent} reminder${row.remindersSent === 1 ? "" : "s"}` : "No reminders yet"}
        {row.escalatedAt ? ` · escalated ${formatDate(row.escalatedAt)}` : ""}
      </p>
    </div>
  );
}

export function AcknowledgementsTab({ doc }: { doc: ManageDocumentDto }) {
  const lookups = useLookups();
  const structure = structureOptions(lookups.data);
  const stats = useDocumentCompliance(doc.id);
  const [status, setStatus] = useState<AckReportStatus>("outstanding");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [locationId, setLocationId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const report = useAcknowledgementReport(doc.id, { page, pageSize: PAGE_SIZE, status, q: q || undefined, departmentId, locationId });

  if (!doc.requiresAcknowledgement) {
    return <EmptyState icon={UserCheck} title="Acknowledgement is not required" description="Turn on “Acknowledgement required” in Overview to track who has read this document." />;
  }

  const s = stats.data;
  const filters = { departmentId, locationId };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Required" value={s?.required ?? "–"} icon={Users} />
        <StatCard label="Acknowledged" value={s?.acknowledged ?? "–"} hint={s ? `${s.percent}% complete` : undefined} icon={CheckCircle2} tone="success" />
        <StatCard label="Outstanding" value={s?.outstanding ?? "–"} icon={UserCheck} tone="warning" />
        <StatCard label="Overdue" value={s?.overdue ?? "–"} icon={AlertTriangle} tone="danger" />
      </div>
      {s && (
        <Card className="gap-2 px-4">
          <ComplianceProgress stats={s} />
          {s.requiredVersionNumber && s.requiredVersionNumber > 1 && (
            <p className="text-xs text-muted-foreground">Only acknowledgements of version {s.requiredVersionNumber} or later count.</p>
          )}
        </Card>
      )}

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={status}
            onValueChange={(v) => {
              setStatus(v as AckReportStatus);
              setPage(1);
            }}
          >
            <TabsList className="h-9 w-full sm:w-fit">
              <TabsTrigger value="outstanding" className="px-3">
                Outstanding {s ? `(${s.outstanding})` : ""}
              </TabsTrigger>
              <TabsTrigger value="overdue" className="px-3">
                Overdue {s ? `(${s.overdue})` : ""}
              </TabsTrigger>
              <TabsTrigger value="acknowledged" className="px-3">
                Acknowledged {s ? `(${s.acknowledged})` : ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={acknowledgementExportUrl(doc.id, { status: "acknowledged", ...filters })} download>
                <Download /> Audit trail (CSV)
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={acknowledgementExportUrl(doc.id, { status: "outstanding", ...filters })} download>
                <Download /> Outstanding (CSV)
              </a>
            </Button>
          </div>
        </div>
        <div className="grid gap-2 border-b p-3 sm:grid-cols-[2fr_1fr_1fr]">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search name, email or employee no."
          />
          <FilterSelect
            value={departmentId}
            onChange={(v) => {
              setDepartmentId(v);
              setPage(1);
            }}
            options={structure.departments}
            allLabel="All departments"
          />
          <FilterSelect
            value={locationId}
            onChange={(v) => {
              setLocationId(v);
              setPage(1);
            }}
            options={structure.locations}
            allLabel="All locations"
          />
        </div>

        {report.isPending ? (
          <LoadingRows rows={6} className="p-3" />
        ) : report.isError ? (
          <ErrorState error={report.error} onRetry={() => report.refetch()} className="m-3" />
        ) : report.data.items.length === 0 ? (
          <EmptyState
            icon={status === "acknowledged" ? UserCheck : CheckCircle2}
            title={status === "acknowledged" ? "No acknowledgements yet" : status === "overdue" ? "Nobody is overdue" : "Nobody is outstanding"}
            description={q || departmentId || locationId ? "Try different filters." : undefined}
            className="m-3 border-0"
          />
        ) : (
          <>
            <ul className="divide-y md:hidden">
              {report.data.items.map((row) => (
                <li key={row.userId} className="space-y-1.5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{[row.department?.name, row.location?.name].filter(Boolean).join(" · ") || row.email}</p>
                    </div>
                    {row.overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
                  </div>
                  <div className="text-sm">
                    <StatusCell row={row} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="pr-4">{status === "acknowledged" ? "Acknowledged" : "Due"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.items.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="pl-4">
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.email}
                          {row.employeeNumber ? ` · ${row.employeeNumber}` : ""}
                        </p>
                      </TableCell>
                      <TableCell>{row.department?.name ?? "—"}</TableCell>
                      <TableCell>{row.location?.name ?? "—"}</TableCell>
                      <TableCell className="pr-4">
                        <StatusCell row={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        {report.data && report.data.total > 0 && (
          <div className="border-t px-3">
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={report.data.total} onPageChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
