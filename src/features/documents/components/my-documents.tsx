"use client";

import { AlertTriangle, BookOpenCheck, ChevronRight, ClipboardCheck, FileStack } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MyDocumentFilter } from "@/lib/validation/documents";
import { cn } from "@/lib/utils";
import { usePendingAcknowledgements, useMyDocuments, type MyDocumentItem } from "../api";
import { usePendingSurveyAnswers } from "../survey-api";
import { formatDate, relativeDue } from "../format";
import { AckStatusBadge } from "./ack-status-badge";
import { FileTypeIcon } from "./file-type-icon";
import { CategoryFilter, SearchBox } from "./filters";
import { SurveyBadge } from "./survey/survey-badge";

const PAGE_SIZE = 20;

export function BannerStat({ label, value, icon: Icon, highlight }: { label: string; value: number | string; icon: typeof FileStack; highlight?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm", highlight && "bg-white/20")}>
      <Icon className="hidden size-5 shrink-0 text-white/80 sm:block" />
      <div className="min-w-0">
        <p className="font-heading text-xl font-semibold leading-none tabular-nums">{value}</p>
        <p className="mt-1 text-[0.7rem] leading-tight text-white/75 sm:text-xs">{label}</p>
      </div>
    </div>
  );
}

function DocumentRow({ doc, pending, surveyPending }: { doc: MyDocumentItem; pending: boolean; surveyPending: boolean }) {
  const due = doc.ackStatus === "outstanding" || doc.ackStatus === "overdue" ? relativeDue(doc.dueAt) : null;
  return (
    <li>
      <Link href={`/documents/${doc.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
        <FileTypeIcon mimeType={doc.currentVersion?.mimeType} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{doc.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[doc.category?.name, doc.currentVersion ? `Version ${doc.currentVersion.versionNumber}` : null, `Updated ${formatDate(doc.currentVersion?.createdAt ?? doc.updatedAt)}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 md:hidden">
            <AckStatusBadge status={doc.ackStatus} acknowledgedAt={doc.acknowledgement?.acknowledgedAt} pendingSync={pending} />
            <SurveyBadge survey={doc.survey} pendingSync={surveyPending} />
            {due && !pending && <span className={cn("text-xs", doc.ackStatus === "overdue" ? "text-destructive" : "text-muted-foreground")}>{due}</span>}
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 md:flex">
          <div className="flex items-center gap-1.5">
            <SurveyBadge survey={doc.survey} pendingSync={surveyPending} />
            <AckStatusBadge status={doc.ackStatus} acknowledgedAt={doc.acknowledgement?.acknowledgedAt} pendingSync={pending} />
            {doc.ackStatus === "not_required" && <StatusBadge>For information</StatusBadge>}
          </div>
          {due && !pending && <span className={cn("text-xs", doc.ackStatus === "overdue" ? "text-destructive" : "text-muted-foreground")}>{due}</span>}
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

/** My Documents – the simple employee view of documents assigned to them. */
export function MyDocuments() {
  const [filter, setFilter] = useState<MyDocumentFilter>("all");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const query = useMyDocuments({ page, pageSize: PAGE_SIZE, filter, q: q || undefined, categoryId });
  const pending = usePendingAcknowledgements();
  const pendingSurveys = usePendingSurveyAnswers();
  const summary = query.data?.summary;

  const reset = () => setPage(1);

  return (
    <>
      <PageBanner title="My Documents" description="Policies and procedures assigned to you. Open each one, confirm you have read it and answer any survey where asked.">
        <div className="grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">
          <BannerStat label="To do" value={summary?.actionRequired ?? "–"} icon={ClipboardCheck} highlight={Boolean(summary?.actionRequired)} />
          <BannerStat label="Overdue" value={summary?.actionOverdue ?? "–"} icon={AlertTriangle} />
          <BannerStat label="Documents" value={summary?.total ?? "–"} icon={FileStack} />
        </div>
      </PageBanner>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={filter}
          onValueChange={(v) => {
            setFilter(v as MyDocumentFilter);
            reset();
          }}
        >
          <TabsList className="h-9 w-full sm:w-fit">
            <TabsTrigger value="all" className="px-3">
              All
            </TabsTrigger>
            <TabsTrigger value="action" className="px-3">
              Action required
              {Boolean(summary?.actionRequired) && (
                <span className="ml-1 rounded-full bg-warning/20 px-1.5 text-[0.7rem] font-semibold text-[#9a5b00] tabular-nums">{summary?.actionRequired}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="acknowledged" className="px-3">
              Acknowledged
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid gap-2 sm:grid-cols-[1fr_200px] lg:w-[480px]">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              reset();
            }}
            placeholder="Search documents"
          />
          <CategoryFilter
            value={categoryId}
            onChange={(v) => {
              setCategoryId(v);
              reset();
            }}
          />
        </div>
      </div>

      {query.isPending ? (
        <LoadingRows rows={5} className="[&>*]:h-16" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title={filter === "action" && !q && !categoryId ? "You're all caught up" : "No documents found"}
          description={
            filter === "action" && !q && !categoryId
              ? "There is nothing waiting for your acknowledgement or answers."
              : q || categoryId
                ? "Try a different search or category."
                : "Documents assigned to you will appear here."
          }
        />
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {query.data.items.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} pending={pending.has(doc.id)} surveyPending={pendingSurveys.has(doc.id)} />
            ))}
          </ul>
          {query.data.total > PAGE_SIZE && (
            <div className="border-t px-3">
              <PaginationBar page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={setPage} />
            </div>
          )}
        </Card>
      )}
    </>
  );
}
