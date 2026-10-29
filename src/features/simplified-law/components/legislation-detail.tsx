"use client";

import { ArrowRight, ClipboardCheck, ExternalLink, FileSearch, History, ListChecks, MoreHorizontal, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUsersByIds } from "@/features/shared/lookups";
import { ApiError } from "@/lib/api-client";
import { APPLICABILITY_LABELS, isStepTab, SLAW_BASE, slawLegislationHref, STATUS_HINTS, statusLabels, type SlawStepTab, type StatusLabels } from "@/lib/simplified-law";
import { useLegislation, useLegislationHistory, useSlawSettings, type SlawLegislationDetailDto } from "../api";
import { describeChanges, formatDate, formatDateTime, HISTORY_LABELS, personIdsIn } from "../format";
import { ApplicabilityTab } from "./applicability-tab";
import { ArticleOverview } from "./article-overview";
import { RequirementsTab } from "./requirements-tab";
import { categoryPath, LegalStatusBadge, legislationListHref, OfficialLink, ProgressBadge, StepsBar } from "./shared";

export function LegislationDetail({ id }: { id: string }) {
  const query = useLegislation(id);
  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Law not found" description="It does not exist or you do not have access to it." className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <Detail law={query.data} />;
}

function Detail({ law }: { law: SlawLegislationDetailDto }) {
  const router = useRouter();
  const params = useSearchParams();
  const settings = useSlawSettings();
  const labels = statusLabels(settings.data?.statusLabels);
  const fromUrl = params.get("step");
  const [tab, setTabState] = useState<SlawStepTab>(isStepTab(fromUrl) ? fromUrl : "overview");
  const setTab = (next: string) => {
    if (!isStepTab(next)) return;
    setTabState(next);
    router.replace(slawLegislationHref(law.id, next), { scroll: false });
  };
  const listHref = legislationListHref(law.category.id);
  const name = law.shortTitle || law.title;

  const primary =
    law.nextStep === "applicability" ? (
      <Button onClick={() => setTab("applicability")}>
        <ClipboardCheck /> Check applicability
      </Button>
    ) : law.nextStep === "requirements" ? (
      <Button onClick={() => setTab("requirements")}>
        <ListChecks /> Check requirements
      </Button>
    ) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="line-clamp-4 text-xl sm:line-clamp-none sm:text-2xl" title={law.title}>
            {law.title}
          </span>
        }
        backHref={listHref}
        backLabel={categoryPath(law)}
        description={[law.jurisdiction, law.reference].filter(Boolean).join(" · ")}
        meta={
          <>
            <LegalStatusBadge status={law.status} labels={labels} note={law.kindLabel} />
            {law.status !== "REPEALED" && <ProgressBadge progress={law.progress} />}
            {law.archived && <StatusBadge tone="warning">Archived</StatusBadge>}
          </>
        }
        actions={
          <>
            {primary}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label="More actions">
                  <MoreHorizontal /> <span className="sm:hidden">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {law.officialUrl && (
                  <DropdownMenuItem asChild>
                    <a href={law.officialUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> Official document
                    </a>
                  </DropdownMenuItem>
                )}
                {law.rights.assess && law.applicability !== "NOT_CHECKED" && law.status !== "REPEALED" && (
                  <DropdownMenuItem onSelect={() => setTab("applicability")}>
                    <ClipboardCheck /> Change the applicability decision
                  </DropdownMenuItem>
                )}
                {law.rights.manage && (
                  <DropdownMenuItem asChild>
                    <Link href={`${SLAW_BASE}/configuration/legislation/${law.id}`}>
                      <Pencil /> Edit law, questions and requirements
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setTab("history")}>
                  <History /> History
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <StepsBar steps={law.steps} links={{ category: `${SLAW_BASE}?category=${law.parentCategory?.id ?? law.category.id}`, legislation: listHref }} />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="overview" className="px-3">
            Overview
          </TabsTrigger>
          <TabsTrigger value="applicability" className="px-3">
            Applicability
          </TabsTrigger>
          <TabsTrigger value="requirements" className="px-3">
            Requirements{law.applicability === "APPLIES" && law.counts.total ? <span className="hidden sm:inline">&nbsp;({law.counts.total})</span> : null}
          </TabsTrigger>
          <TabsTrigger value="history" className="px-3">
            History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab law={law} labels={labels} name={name} onNext={() => setTab(law.applicability === "APPLIES" ? "requirements" : "applicability")} />
        </TabsContent>
        <TabsContent value="applicability">
          <ApplicabilityTab law={law} onDecided={(d) => setTab(d === "APPLIES" ? "requirements" : "overview")} />
        </TabsContent>
        <TabsContent value="requirements">
          <RequirementsTab law={law} onCheckApplicability={() => setTab("applicability")} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab law={law} labels={labels} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function OverviewTab({ law, labels, name, onNext }: { law: SlawLegislationDetailDto; labels: StatusLabels; name: string; onNext: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>What it is about</CardTitle>
            <CardDescription>Summary in plain words – the official document is the legal text.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{law.summary || "No summary yet."}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <OfficialLink href={law.officialUrl} />
              <OfficialLink href={law.guidanceUrl} label="Plain-language guidance" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Overview: {name}</CardTitle>
            <CardDescription>Article by article, with the date it applies from and who it applies to.</CardDescription>
          </CardHeader>
          <CardContent>
            <ArticleOverview articles={law.articles} roles={law.roles} />
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Key facts</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Fact label="Jurisdiction">{law.jurisdiction}</Fact>
              <Fact label="Number / year">{law.reference || "—"}</Fact>
              <Fact label="Status">
                {labels[law.status]}
                {law.kindLabel ? ` · ${law.kindLabel}` : ""}
                <span className="block text-xs text-muted-foreground">{STATUS_HINTS[law.status]}</span>
              </Fact>
              {law.relationNote && <Fact label="Related laws">{law.relationNote}</Fact>}
              <Fact label="Category">{categoryPath(law)}</Fact>
            </dl>
          </CardContent>
        </Card>
        {law.status !== "REPEALED" && (
          <Card>
            <CardHeader>
              <CardTitle>Does it apply to us?</CardTitle>
              <CardDescription>
                {APPLICABILITY_LABELS[law.applicability]}
                {law.applicabilityBy ? ` – ${law.applicabilityBy.name}, ${formatDate(law.applicabilityAt)}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {law.applicabilityReason && <p className="text-sm">{law.applicabilityReason}</p>}
              <Button variant={law.nextStep ? "default" : "outline"} className="w-full" onClick={onNext}>
                {law.applicability === "APPLIES" ? "Requirements" : law.applicability === "NOT_CHECKED" ? "Answer the questions" : "See the answers"} <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function HistoryTab({ law, labels }: { law: SlawLegislationDetailDto; labels: StatusLabels }) {
  const [page, setPage] = useState(1);
  const history = useLegislationHistory(law.id, page);
  const people = useUsersByIds([...new Set((history.data?.items ?? []).flatMap((e) => personIdsIn(e.changes)))]);
  const nameOf = (uid: string) => people.data?.find((u) => u.id === uid)?.name ?? null;
  if (history.isPending) return <LoadingRows rows={4} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (!history.data.items.length) return <EmptyState icon={History} title="No history yet" description="Answers, checks and changes appear here." />;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>History</CardTitle>
        <CardDescription>Signed audit trail of this law and its requirements – changes never remove earlier entries.</CardDescription>
      </CardHeader>
      <ul className="divide-y">
        {history.data.items.map((e) => {
          const meta = (e.metadata ?? {}) as { note?: unknown; what?: unknown; text?: unknown; article?: unknown; closedActions?: unknown };
          const lines = describeChanges(e.changes, labels, nameOf);
          return (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{typeof meta.what === "string" ? meta.what : (HISTORY_LABELS[e.action] ?? e.action.replace(/_/g, " ").toLowerCase())}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(e.createdAt)} · {e.actorName ?? "System"}
                </p>
              </div>
              {e.subject && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">Requirement: {e.subject}</p>}
              {lines.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
              {typeof meta.note === "string" && meta.note && <p className="mt-1 text-sm text-muted-foreground">{meta.note}</p>}
              {typeof meta.text === "string" && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{meta.text}</p>}
              {typeof meta.article === "string" && <p className="mt-1 text-sm text-muted-foreground">{meta.article}</p>}
              {typeof meta.closedActions === "number" && meta.closedActions > 0 && <p className="mt-1 text-sm text-muted-foreground">{meta.closedActions} open action(s) closed</p>}
            </li>
          );
        })}
      </ul>
      <div className="border-t px-3">
        <PaginationBar page={page} pageSize={25} total={history.data.total} onPageChange={setPage} />
      </div>
    </Card>
  );
}
