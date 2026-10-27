"use client";

import { format } from "date-fns";
import { ChevronDown, History, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuditLog, type AuditRow } from "../api";

const ENTITY_TYPES = ["Document", "DocumentVersion", "DocumentCategory", "User", "Role", "RoleAssignment", "BusinessUnit", "Site", "Location", "Department", "LookupValue", "Setting", "Organization", "BulkImport"];

export function AuditLog() {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [entityType, setEntityType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const query = useAuditLog({ page, pageSize: 25, q: q || undefined, entityType: entityType === "all" ? undefined : entityType });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only record of every change in your company. Entries are signed and cannot be edited or deleted."
        backHref="/configuration"
        backLabel="Configuration"
      />
      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search action or user"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </InputGroup>
          <Select
            value={entityType}
            onValueChange={(v) => {
              setEntityType(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All records</SelectItem>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {query.isPending ? (
        <LoadingRows rows={10} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={History} title="No audit entries" />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {query.data.items.map((entry) => (
              <AuditEntry key={entry.id} entry={entry} />
            ))}
          </ul>
          <div className="border-t px-3">
            <PaginationBar page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPageChange={setPage} />
          </div>
        </Card>
      )}
    </>
  );
}

function AuditEntry({ entry }: { entry: AuditRow }) {
  const hasDetail = Boolean(entry.changes || entry.metadata);
  return (
    <Collapsible asChild>
      <li>
        <CollapsibleTrigger className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 disabled:cursor-default" disabled={!hasDetail}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="brand" className="h-5 text-[11px]">
                {entry.entityType}
              </StatusBadge>
              <span className="text-sm font-medium">{entry.action.replaceAll("_", " ").toLowerCase()}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {entry.actorName ?? "System"} · {format(new Date(entry.createdAt), "d MMM yyyy, HH:mm:ss")} · {entry.entityId}
              {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
            </p>
          </div>
          {hasDetail && <ChevronDown className="mt-1 size-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />}
        </CollapsibleTrigger>
        {hasDetail && (
          <CollapsibleContent>
            <pre className="mx-4 mb-3 max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify({ changes: entry.changes ?? undefined, metadata: entry.metadata ?? undefined }, null, 2)}
            </pre>
          </CollapsibleContent>
        )}
      </li>
    </Collapsible>
  );
}
