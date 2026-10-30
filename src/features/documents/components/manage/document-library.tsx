"use client";

import { AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList, FileStack, FileUp, Users } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlSearchText, useUrlState, useUrlTab } from "@/hooks/use-url-state";
import { PERMISSIONS } from "@/lib/permissions";
import { LIBRARY_TABS, libraryQuerySchema, type LibraryStatusFilter, type LibraryTab } from "@/lib/validation/documents";
import { useComplianceSummary, useDocumentLibrary, useLibrarySummary, type LibraryItem } from "../../api";
import { audienceLabel, DOCUMENT_STATUS_META, formatDate } from "../../format";
import { BannerStat, BannerStatGroup, type BannerStatHelp } from "../banner-stats";
import { ComplianceProgress } from "../compliance-progress";
import { DocumentCreateButtons } from "../create-buttons";
import { FileTypeIcon } from "../file-type-icon";
import { CategoryFilter, FilterSelect, SearchBox, TagFilter } from "../filters";
import { SurveyIndicator } from "../survey/survey-indicator";
import { SurveyLibraryTab } from "../survey/survey-library";
import { TagChips } from "../tag-chips";

const PAGE_SIZE = 20;
/** URL state of the Documents tab; `type` is fixed to "document" and `createdBy` belongs to the Response forms tab. */
const urlSchema = libraryQuerySchema.pick({ page: true, q: true, categoryId: true, tagId: true, status: true });
/** Each tab has its own filters, so switching tab starts it clean. */
const TAB_RESET_KEYS = ["page", "q", "categoryId", "tagId", "status", "createdBy"] as const;

/** Plain-word meaning of the banner numbers (ⓘ next to each group, and the hover title of each number). */
const DOCUMENT_HELP = {
  toDo: { label: "To do", text: "Published documents that still have people who must acknowledge them." },
  overdue: { label: "Overdue", text: "Published documents where someone is past the acknowledgement deadline." },
  total: { label: "Documents", text: "All active documents in this library – published and drafts, as listed in the Documents tab." },
} satisfies Record<string, BannerStatHelp>;
const FORM_HELP = {
  toComplete: { label: "To complete", text: "Published, open response forms that someone in their audience still has to complete (or whose file someone still has to acknowledge)." },
  overdue: { label: "Overdue", text: "Open response forms where someone is past the deadline to complete it or to acknowledge its file." },
  completed: { label: "Completed", text: "Published response forms that everyone in their audience has completed (and acknowledged, when that is asked)." },
} satisfies Record<string, BannerStatHelp>;

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

/**
 * Document Library for document managers and acknowledgement reporters: tabs Documents (default) · Response forms
 * (`?tab=forms`, the former Survey / Induction Library – owner's decision, 30 Oct 2026). The banner offers both
 * create buttons (the one for the open tab is the solid one) and, whatever the tab, two groups of library-wide numbers
 * separated by a thin line: Documents (To do · Overdue · Documents) and Response forms (To complete · Overdue ·
 * Completed) – owner's request, same day. Rules: library-summary-rules.ts; the table's search and filters don't change them.
 */
export function DocumentLibrary() {
  const { can } = useCurrentUser();
  const canManage = can(PERMISSIONS.DOCUMENTS_MANAGE);
  const tab = useUrlTab<LibraryTab>("tab", "documents", LIBRARY_TABS, { resetKeys: TAB_RESET_KEYS });
  const summary = useLibrarySummary().data;
  const docs = summary?.documents;
  const forms = summary?.forms;

  return (
    <>
      <PageBanner
        title="Document Library"
        description="Publish documents and response forms, choose who must read or complete them, and follow their progress."
        actions={canManage ? <DocumentCreateButtons primary={tab.value === "forms" ? "form" : "document"} /> : undefined}
      >
        {/* Side by side with a thin vertical line once the banner is wide enough; stacked with a horizontal line on phones. */}
        <div className="grid gap-4 @3xl/banner:grid-cols-2 @3xl/banner:gap-0">
          <BannerStatGroup title="Documents" icon={FileStack} href="/documents/manage" help={Object.values(DOCUMENT_HELP)} className="@3xl/banner:pr-6">
            <BannerStat label="To do" value={docs?.toDo ?? "–"} icon={ClipboardCheck} highlight={Boolean(docs?.toDo)} hint={DOCUMENT_HELP.toDo.text} />
            <BannerStat label="Overdue" value={docs?.overdue ?? "–"} icon={AlertTriangle} hint={DOCUMENT_HELP.overdue.text} />
            <BannerStat label="Documents" value={docs?.total ?? "–"} icon={FileStack} hint={DOCUMENT_HELP.total.text} />
          </BannerStatGroup>
          <BannerStatGroup
            title="Response forms"
            icon={ClipboardList}
            href="/documents/manage?tab=forms"
            help={Object.values(FORM_HELP)}
            className="border-t border-white/25 pt-4 @3xl/banner:border-t-0 @3xl/banner:border-l @3xl/banner:pt-0 @3xl/banner:pl-6"
          >
            <BannerStat label="To complete" value={forms?.toComplete ?? "–"} icon={ClipboardCheck} highlight={Boolean(forms?.toComplete)} hint={FORM_HELP.toComplete.text} />
            <BannerStat label="Overdue" value={forms?.overdue ?? "–"} icon={AlertTriangle} hint={FORM_HELP.overdue.text} />
            <BannerStat label="Completed" value={forms?.completed ?? "–"} icon={CheckCircle2} hint={FORM_HELP.completed.text} />
          </BannerStatGroup>
        </div>
      </PageBanner>

      <Tabs {...tab} className="gap-4">
        <TabsList className="h-9 w-full sm:w-fit">
          <TabsTrigger value="documents" className="px-3">
            <FileStack /> Documents
          </TabsTrigger>
          <TabsTrigger value="forms" className="px-3">
            <ClipboardList /> Response forms
          </TabsTrigger>
        </TabsList>
        <TabsContent value="documents">
          <DocumentsTab />
        </TabsContent>
        <TabsContent value="forms">
          <SurveyLibraryTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** Documents tab: acknowledgement totals for reporters, filters and the documents table (surveys are left out). */
function DocumentsTab() {
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
