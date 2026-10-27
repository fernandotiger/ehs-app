"use client";

import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, ClipboardList, CloudOff } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge, type BadgeTone } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MySurveyFilter } from "@/lib/validation/documents";
import { cn } from "@/lib/utils";
import { usePendingAcknowledgements, type MyDocumentItem } from "../../api";
import { formatDate, relativeDue } from "../../format";
import { useMySurveys, usePendingSurveyAnswers, type MySurveyStatus } from "../../survey-api";
import { AckStatusBadge } from "../ack-status-badge";
import { SearchBox } from "../filters";
import { BannerStat } from "../my-documents";

const PAGE_SIZE = 20;

/** Plain labels for the reader's own list (the document lists use "Survey to answer" etc.). */
const STATUS_META: Record<MySurveyStatus, { label: string; tone: BadgeTone }> = {
  REQUIRED: { label: "To answer", tone: "warning" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  OPTIONAL: { label: "Optional", tone: "brand" },
  ANSWERED: { label: "Answered", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

function SurveyRow({ item, ackPending, answerPending }: { item: MyDocumentItem; ackPending: boolean; answerPending: boolean }) {
  const survey = item.survey;
  const meta = survey ? STATUS_META[survey.status] : null;
  const due = survey && (survey.status === "REQUIRED" || survey.status === "OVERDUE") ? relativeDue(survey.dueAt) : null;
  const ackToDo = item.ackStatus === "outstanding" || item.ackStatus === "overdue";
  const badges = (
    <>
      {answerPending ? (
        <StatusBadge tone="info">
          <CloudOff className="size-3.5" /> Pending sync
        </StatusBadge>
      ) : (
        meta && (
          <StatusBadge tone={meta.tone} dot>
            {meta.label}
          </StatusBadge>
        )
      )}
      {ackToDo && <AckStatusBadge status={item.ackStatus} pendingSync={ackPending} />}
    </>
  );
  return (
    <li>
      <Link href={`/documents/${item.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <ClipboardList className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[item.currentVersion ? "With a file to read" : null, item.publishedAt ? `Published ${formatDate(item.publishedAt)}` : null].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 md:hidden">
            {badges}
            {due && !answerPending && <span className={cn("text-xs", survey?.status === "OVERDUE" ? "text-destructive" : "text-muted-foreground")}>{due}</span>}
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 md:flex">
          <div className="flex items-center gap-1.5">{badges}</div>
          {due && !answerPending && <span className={cn("text-xs", survey?.status === "OVERDUE" ? "text-destructive" : "text-muted-foreground")}>{due}</span>}
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

/** My Surveys – the employee's list of surveys to answer (surveys are kept out of My Documents). */
export function MySurveys() {
  const [filter, setFilter] = useState<MySurveyFilter>("all");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const query = useMySurveys({ page, pageSize: PAGE_SIZE, filter, q: q || undefined });
  const ackPending = usePendingAcknowledgements();
  const answerPending = usePendingSurveyAnswers();
  const summary = query.data?.summary;

  return (
    <>
      <PageBanner title="My Surveys" description="Surveys you have been asked to answer. Open one to read any file that comes with it and send your answers.">
        <div className="grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">
          <BannerStat label="To answer" value={summary?.toAnswer ?? "–"} icon={ClipboardCheck} highlight={Boolean(summary?.toAnswer)} />
          <BannerStat label="Overdue" value={summary?.overdue ?? "–"} icon={AlertTriangle} />
          <BannerStat label="Answered" value={summary?.answered ?? "–"} icon={CheckCircle2} />
        </div>
      </PageBanner>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={filter}
          onValueChange={(v) => {
            setFilter(v as MySurveyFilter);
            setPage(1);
          }}
        >
          <TabsList className="h-9 w-full sm:w-fit">
            <TabsTrigger value="all" className="px-3">
              All
            </TabsTrigger>
            <TabsTrigger value="todo" className="px-3">
              To answer
              {Boolean(summary?.toAnswer) && (
                <span className="ml-1 rounded-full bg-warning/20 px-1.5 text-[0.7rem] font-semibold text-[#9a5b00] tabular-nums">{summary?.toAnswer}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="answered" className="px-3">
              Answered
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="lg:w-80">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search surveys"
          />
        </div>
      </div>

      {query.isPending ? (
        <LoadingRows rows={5} className="[&>*]:h-16" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filter === "todo" && !q ? "You're all caught up" : "No surveys found"}
          description={
            filter === "todo" && !q ? "There is no survey waiting for your answers." : q ? "Try a different search." : "Surveys you are asked to answer will appear here."
          }
        />
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {query.data.items.map((item) => (
              <SurveyRow key={item.id} item={item} ackPending={ackPending.has(item.id)} answerPending={answerPending.has(item.id)} />
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
