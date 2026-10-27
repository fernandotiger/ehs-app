"use client";

import { AlertTriangle, ArrowRight, CalendarClock, ClipboardList, FilePlus2, Flame, ListChecks, ShieldCheck, Target } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/common/stat-card";
import { ErrorState, LoadingCards, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/permissions";
import { useRiskOverview, type AttentionItem, type RiskOverviewDto } from "../../api";
import { formatDate } from "../../format";
import { AssessmentStatusBadge, BarList, ProgressBar, ScoreChip } from "../shared";

const KIND_LABEL: Record<AttentionItem["kind"], { label: string; tone: "danger" | "warning" | "purple" | "neutral" | "info" }> = {
  "review-overdue": { label: "Review overdue", tone: "danger" },
  "task-overdue": { label: "Overdue", tone: "danger" },
  approval: { label: "Approve", tone: "purple" },
  "review-due": { label: "Review due", tone: "warning" },
  draft: { label: "Draft", tone: "neutral" },
};

export function RiskStatCards({ data, compact = false }: { data: RiskOverviewDto | undefined; compact?: boolean }) {
  const c = data?.counts;
  return (
    <div className={compact ? "grid grid-cols-2 gap-3 lg:grid-cols-4" : "mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"}>
      <StatCard label="Active assessments" value={c?.active ?? "–"} icon={ClipboardList} href="/risk/assessments" />
      <StatCard label="High or critical" value={c?.highCritical ?? "–"} hint="incl. checklist action required" icon={Flame} tone={c?.highCritical ? "danger" : "success"} href="/risk/assessments?band=ATTENTION" />
      <StatCard label="Reviews due" value={c?.reviewsDue ?? "–"} hint={c ? `${c.reviewsOverdue} overdue` : undefined} icon={CalendarClock} tone={c?.reviewsOverdue ? "danger" : "warning"} href="/risk/assessments?review=due" />
      <StatCard label="Overdue tasks" value={c?.overdueTasks ?? "–"} hint={c ? `${c.openTasks} open` : undefined} icon={ListChecks} tone={c?.overdueTasks ? "danger" : "info"} href="/risk/tasks?overdue=true" />
    </div>
  );
}

/** Risk landing: banner, KPI cards, needs attention, recent assessments, risk levels and programme progress. */
export function RiskOverview() {
  const { can } = useCurrentUser();
  const overview = useRiskOverview();
  return (
    <>
      <PageBanner
        title="Risk"
        description="Find what could go wrong, score it, agree the controls and keep it under review."
        actions={
          <>
            {can(PERMISSIONS.RISK_CREATE) && (
              <Button asChild size="lg" className="bg-white text-brand-dark hover:bg-white/90">
                <Link href="/risk/assessments/new">
                  <FilePlus2 /> New assessment
                </Link>
              </Button>
            )}
            <Button asChild size="lg" className="bg-brand-dark text-brand-dark-foreground hover:bg-brand-dark/90">
              <Link href="/risk/assessments">
                <ClipboardList /> All assessments
              </Link>
            </Button>
          </>
        }
      />
      <RiskStatCards data={overview.data} />
      {overview.isPending ? (
        <LoadingCards count={4} />
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-brand" /> Needs attention
                </CardTitle>
                <CardDescription>Overdue reviews and tasks, assessments waiting for approval and reviews coming up.</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.data.needsAttention.length === 0 ? (
                  <p className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-6 text-sm text-success">
                    <ShieldCheck className="size-4" /> Nothing needs attention right now.
                  </p>
                ) : (
                  <ul className="-mx-2 divide-y">
                    {overview.data.needsAttention.map((n) => (
                      <li key={`${n.kind}-${n.id}`}>
                        <Link href={n.href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              <span className="text-muted-foreground">{n.reference} · </span>
                              {n.title}
                            </p>
                            <p className="text-xs text-muted-foreground">{n.due ? `${n.detail} · ${formatDate(n.due)}` : n.detail}</p>
                          </div>
                          <StatusBadge tone={KIND_LABEL[n.kind].tone}>{KIND_LABEL[n.kind].label}</StatusBadge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recently updated</CardTitle>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/risk/assessments">
                      View all <ArrowRight />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {overview.data.recent.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No assessments yet.</p>
                ) : (
                  <ul className="-mx-2 divide-y">
                    {overview.data.recent.map((a) => (
                      <li key={a.id}>
                        <Link href={`/risk/assessments/${a.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{a.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {a.reference} · {a.siteName ?? "No site"} · {a.owner?.name ?? "No owner"}
                            </p>
                          </div>
                          <ScoreChip score={a.score} band={a.band} method={a.method} className="hidden sm:inline-flex" />
                          <AssessmentStatusBadge status={a.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Assessments by risk level</CardTitle>
                <CardDescription>Current overall score of active assessments</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList items={overview.data.byBand} empty="No scored assessments yet." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="size-4 text-brand" /> Programmes in progress
                </CardTitle>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/risk/strategy?tab=programmes">
                      Objectives & programmes <ArrowRight />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {overview.data.programmes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No open management programmes.</p>
                ) : (
                  <ul className="space-y-3">
                    {overview.data.programmes.map((p) => (
                      <li key={p.id}>
                        <Link href={`/risk/strategy/programmes/${p.id}`} className="block rounded-lg hover:bg-muted/40">
                          <p className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate font-medium">{p.title}</span>
                            <span className={p.overdue ? "shrink-0 text-xs text-destructive" : "shrink-0 text-xs text-muted-foreground"}>Due {formatDate(p.deadline)}</span>
                          </p>
                          <ProgressBar value={p.progress} label={`${p.title} task progress`} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/** Home: Risk KPI cards. */
export function RiskDashboardWidget() {
  const overview = useRiskOverview();
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Risk</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/risk">
            Open Risk <ArrowRight />
          </Link>
        </Button>
      </div>
      {overview.isPending ? <LoadingRows rows={1} /> : <RiskStatCards data={overview.data} compact />}
    </section>
  );
}
