"use client";

import { ChevronRight, Flag, Gauge, Layers, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterSelect, SearchBox } from "@/features/documents/components/filters";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import { PERMISSIONS } from "@/lib/permissions";
import { TARGET_DIRECTION_LABELS } from "@/lib/risk/labels";
import { useObjectives, useProgrammes, useTargets, type StrategyListParams } from "../../api";
import { formatDate, formatNumber } from "../../format";
import { ProgressBar, StrategyStatusBadge } from "../shared";
import { StrategyFormSheet, type StrategySheet } from "./strategy-forms";

type Tab = "objectives" | "targets" | "programmes";
const PAGE_SIZE = 20;

/** Objectives · Targets · Programmes with drill-down (objective → targets → programmes → tasks). */
export function StrategyPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useCurrentUser();
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "targets" || tabParam === "programmes" ? tabParam : "objectives";
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState<StrategyListParams["status"]>("OPEN");
  const [siteId, setSiteId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [sheet, setSheet] = useState<StrategySheet | null>(null);
  const structure = structureOptions(useLookups().data);
  const query: StrategyListParams = { page, pageSize: PAGE_SIZE, q: q || undefined, status, siteId };
  const objectives = useObjectives(query, tab === "objectives");
  const targets = useTargets(query, tab === "targets");
  const programmes = useProgrammes(query, tab === "programmes");
  const canCreate = can(PERMISSIONS.RISK_CREATE);
  const kind = tab === "objectives" ? "objective" : tab === "targets" ? "target" : "programme";

  return (
    <>
      <PageHeader
        title="Objectives & programmes"
        description="Objectives set the direction, targets measure it and management programmes plan the work and tasks."
        actions={
          canCreate ? (
            <Button onClick={() => setSheet({ kind } as StrategySheet)}>
              <Plus /> New {kind}
            </Button>
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={(v) => { router.replace(`${pathname}?tab=${v}`, { scroll: false }); setPage(1); }} className="mb-3">
        <TabsList>
          <TabsTrigger value="objectives">
            <Flag className="size-3.5" /> Objectives
          </TabsTrigger>
          <TabsTrigger value="targets">
            <Gauge className="size-3.5" /> Targets
          </TabsTrigger>
          <TabsTrigger value="programmes">
            <Layers className="size-3.5" /> Programmes
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="mb-4 gap-2 p-3">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by title" />
          <FilterSelect
            value={status}
            onChange={(v) => { setStatus(v as StrategyListParams["status"]); setPage(1); }}
            options={[{ id: "OPEN", name: "Not completed" }, ...(tab === "programmes" ? [{ id: "PLANNED", name: "Planned" }] : []), { id: "ACTIVE", name: "Active" }, { id: "COMPLETED", name: "Completed" }]}
            allLabel="Any status"
          />
          <FilterSelect value={siteId} onChange={(v) => { setSiteId(v); setPage(1); }} options={structure.sites} allLabel="All sites" />
        </div>
      </Card>

      {tab === "objectives" &&
        (objectives.isPending ? (
          <LoadingRows rows={4} />
        ) : objectives.isError ? (
          <ErrorState error={objectives.error} onRetry={() => objectives.refetch()} />
        ) : objectives.data.items.length === 0 ? (
          <EmptyState icon={Flag} title="No objectives" description="Start with what the company wants to achieve, e.g. “Reduce transport exposure”." />
        ) : (
          <ListCard total={objectives.data.total} page={page} onPage={setPage}>
            {objectives.data.items.map((o) => (
              <Row key={o.id} href={`/risk/strategy/objectives/${o.id}`} title={o.title} meta={[o.domain, o.placement.siteName, o.owner.name, `due ${formatDate(o.deadline)}`, `${o.targetCount} target${o.targetCount === 1 ? "" : "s"}`, `${o.programmeCount} programme${o.programmeCount === 1 ? "" : "s"}`]} overdue={o.overdue}>
                <ProgressBar value={o.progress} className="w-32" label="Average target progress" />
                <StrategyStatusBadge status={o.status} />
              </Row>
            ))}
          </ListCard>
        ))}

      {tab === "targets" &&
        (targets.isPending ? (
          <LoadingRows rows={4} />
        ) : targets.isError ? (
          <ErrorState error={targets.error} onRetry={() => targets.refetch()} />
        ) : targets.data.items.length === 0 ? (
          <EmptyState icon={Gauge} title="No targets" description="Targets measure an objective from a baseline to a goal." />
        ) : (
          <ListCard total={targets.data.total} page={page} onPage={setPage}>
            {targets.data.items.map((t) => (
              <Row
                key={t.id}
                href={`/risk/strategy/targets/${t.id}`}
                title={t.title}
                meta={[t.objective.title, `${TARGET_DIRECTION_LABELS[t.direction]} ${formatNumber(t.baseline)} → ${formatNumber(t.goal)} ${t.unit}`, `now ${formatNumber(t.current)}`, t.owner.name, `due ${formatDate(t.deadline)}`]}
                overdue={t.overdue}
              >
                <ProgressBar value={t.progress} className="w-32" label="Target progress" />
                <StrategyStatusBadge status={t.status} />
              </Row>
            ))}
          </ListCard>
        ))}

      {tab === "programmes" &&
        (programmes.isPending ? (
          <LoadingRows rows={4} />
        ) : programmes.isError ? (
          <ErrorState error={programmes.error} onRetry={() => programmes.refetch()} />
        ) : programmes.data.items.length === 0 ? (
          <EmptyState icon={Layers} title="No management programmes" description="A programme plans the work (tasks) that moves one or more targets." />
        ) : (
          <ListCard total={programmes.data.total} page={page} onPage={setPage}>
            {programmes.data.items.map((p) => (
              <Row
                key={p.id}
                href={`/risk/strategy/programmes/${p.id}`}
                title={p.title}
                meta={[p.objective.title, p.placement.siteName, p.owner.name, `${formatDate(p.startDate)} – ${formatDate(p.deadline)}`, `${p.taskCount - p.openTasks}/${p.taskCount} tasks done`]}
                overdue={p.overdue}
              >
                <ProgressBar value={p.progress} className="w-32" label="Task progress" />
                <StrategyStatusBadge status={p.status} />
              </Row>
            ))}
          </ListCard>
        ))}

      <StrategyFormSheet sheet={sheet} onClose={() => setSheet(null)} onSaved={(k, id) => router.push(`/risk/strategy/${k}s/${id}`)} />
    </>
  );
}

function ListCard({ children, total, page, onPage }: { children: React.ReactNode; total: number; page: number; onPage: (p: number) => void }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <ul className="divide-y">{children}</ul>
      <div className="border-t px-3">
        <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={onPage} />
      </div>
    </Card>
  );
}

function Row({ href, title, meta, overdue, children }: { href: string; title: string; meta: (string | null | undefined)[]; overdue?: boolean; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex flex-col gap-2 p-4 hover:bg-muted/50 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {meta.filter(Boolean).join(" · ")}
            {overdue ? <span className="text-destructive"> · past deadline</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {children}
          <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
        </div>
      </Link>
    </li>
  );
}
