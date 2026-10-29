"use client";

import { AlertTriangle, CheckCircle2, ClipboardList, FileStack, FileUp, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PaginationBar } from "@/components/common/pagination-bar";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlSearchText, useUrlState } from "@/hooks/use-url-state";
import { PERMISSIONS } from "@/lib/permissions";
import { libraryQuerySchema, type LibraryStatusFilter } from "@/lib/validation/documents";
import { useComplianceSummary, useDocumentLibrary, type LibraryItem } from "../../api";
import { audienceLabel, DOCUMENT_STATUS_META, formatDate } from "../../format";
import { ComplianceProgress } from "../compliance-progress";
import { FileTypeIcon } from "../file-type-icon";
import { CategoryFilter, FilterSelect, SearchBox, TagFilter } from "../filters";
import { SurveyIndicator } from "../survey/survey-indicator";
import { TagChips } from "../tag-chips";

const PAGE_SIZE = 20;
/** URL state; `type` is fixed to "document" and `createdBy` belongs to the Survey Library. */
const urlSchema = libraryQuerySchema.pick({ page: true, q: true, categoryId: true, tagId: true, status: true });

const STATUS_OPTIONS: { id: LibraryStatusFilter; name: string }[] = [
  { id: "PUBLISHED", name: "Published" },
  { id: "DRAFT", name: "Drafts" },
  { id: "ARCHIVED", name: "Archived" },
  { id: "ALL", name: "All statuses" },
];

function StatusPill({ status }: { status: LibraryItem["status"] }) {
  const meta = DOCUMENT_STATUS_META[status];
  return (
    <StatusBadge tone={meta.tone} dot>
      {meta.label}
    </StatusBadge>
  );
}

function AckCell({ item }: { item: LibraryItem }) {
  if (!item.requiresAcknowledgement || !item.compliance) return <span className="text-xs text-muted-foreground">No acknowledgement</span>;
  return <ComplianceProgress stats={item.compliance} compact className="w-full min-w-72 max-w-96" />;
}

/** Document Library for document managers and acknowledgement reporters (surveys have their own Survey Library). */
export function DocumentLibrary() {
  const router = useRouter();
  const { can, canAny } = useCurrentUser();
  const canManage = can(PERMISSIONS.DOCUMENTS_MANAGE);
  const canReport = canAny([PERMISSIONS.DOCUMENTS_ACK_REPORTS, PERMISSIONS.DOCUMENTS_MANAGE]);
  const [{ page, q, categoryId, tagId, status }, set] = useUrlState(urlSchema);
  const [search, setSearch] = useUrlSearchText();
  const library = useDocumentLibrary({ page, pageSize: PAGE_SIZE, q, categoryId, tagId, status, type: "document" });
  const filtered = Boolean(q || categoryId || tagId);
  const summary = useComplianceSummary(5, canReport);
  const totals = summary.data?.totals;

  return (
    <>
      <PageBanner
        title="Document Library"
        description="Publish policies and procedures, choose who must read them, and track acknowledgements."
        actions={
          canManage ? (
            <Button asChild size="lg" className="bg-white text-brand-dark hover:bg-white/90">
              <Link href="/documents/manage/new">
                <FileUp /> Upload document
              </Link>
            </Button>
          ) : undefined
        }
      />

      {canReport && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Tracked documents" value={totals?.documents ?? "–"} icon={ClipboardList} />
          <StatCard label="Required" value={totals?.required ?? "–"} icon={Users} tone="info" />
          <StatCard
            label="Acknowledged"
            value={totals?.acknowledged ?? "–"}
            hint={totals && totals.required ? `${Math.round((totals.acknowledged / totals.required) * 100)}% complete` : undefined}
            icon={CheckCircle2}
            tone="success"
          />
          <StatCard label="Outstanding" value={totals?.outstanding ?? "–"} hint={totals ? `${totals.overdue} overdue` : undefined} icon={AlertTriangle} tone={totals?.overdue ? "danger" : "warning"} />
        </div>
      )}

      <Card className="mb-4 gap-0 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <SearchBox value={search} onChange={setSearch} placeholder="Search by name, reference, category or tag" />
          <CategoryFilter value={categoryId} onChange={(v) => set({ categoryId: v })} />
          <TagFilter scope="library" value={tagId} onChange={(v) => set({ tagId: v })} />
          <FilterSelect
            value={status === "ACTIVE" ? undefined : status}
            onChange={(v) => set({ status: (v as LibraryStatusFilter | undefined) ?? "ACTIVE" })}
            options={STATUS_OPTIONS}
            allLabel="Active (published & drafts)"
            ariaLabel="Status"
          />
        </div>
      </Card>

      {library.isPending ? (
        <LoadingRows rows={6} className="[&>*]:h-16" />
      ) : library.isError ? (
        <ErrorState error={library.error} onRetry={() => library.refetch()} />
      ) : library.data.items.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title="No documents found"
          description={filtered ? "Try a different search or filter." : "Upload your first document to get started."}
          action={
            canManage && !filtered ? (
              <Button asChild>
                <Link href="/documents/manage/new">
                  <FileUp /> Upload document
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y md:hidden">
            {library.data.items.map((item) => (
              <li key={item.id}>
                <Link href={`/documents/manage/${item.id}`} className="block space-y-2.5 p-4 hover:bg-muted/50">
                  <div className="flex items-start gap-3">
                    <FileTypeIcon mimeType={item.currentVersion?.mimeType} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.referenceCode, item.category?.name, item.currentVersion ? `v${item.currentVersion.versionNumber}` : null].filter(Boolean).join(" · ")}
                      </p>
                      <TagChips tags={item.tags} className="mt-1.5" />
                      <SurveyIndicator survey={item.survey} className="mt-1" />
                    </div>
                    <StatusPill status={item.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Users className="mr-1 inline size-3.5" />
                    {audienceLabel(item.audience)}
                  </p>
                  <AckCell item={item} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Document</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead className="min-w-80">Acknowledgement</TableHead>
                  <TableHead className="pr-4 text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {library.data.items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => router.push(`/documents/manage/${item.id}`)}>
                    <TableCell className="max-w-80 pl-4">
                      <Link href={`/documents/manage/${item.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <FileTypeIcon mimeType={item.currentVersion?.mimeType} className="size-9" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{item.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{[item.referenceCode, item.category?.name].filter(Boolean).join(" · ") || "Uncategorised"}</span>
                          <TagChips tags={item.tags} className="mt-1" />
                          <SurveyIndicator survey={item.survey} className="mt-1" />
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={item.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">{item.currentVersion ? `v${item.currentVersion.versionNumber}` : "—"}</TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">{audienceLabel(item.audience)}</TableCell>
                    <TableCell>
                      <AckCell item={item} />
                    </TableCell>
                    <TableCell className="pr-4 text-right text-muted-foreground">{formatDate(item.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-3">
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={library.data.total} onPageChange={(p) => set({ page: p })} />
          </div>
        </Card>
      )}
    </>
  );
}
