"use client";

import { AlertTriangle, ArrowRight, ClipboardCheck, FilePlus2, FileSearch, ListChecks, ShieldCheck, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/common/stat-card";
import { ErrorState, LoadingCards, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/permissions";
import { useIncidentOverview, type IncidentOverviewDto } from "../../api";
import { formatDate } from "../../format";
import { PendingReports } from "../register/incident-register";
import { BarList, IncidentStatusBadge } from "../shared";

const KIND_TONE = { investigation: "danger", action: "warning", review: "purple", draft: "neutral", close: "success" } as const;

export function IncidentStatCards({ data, compact = false }: { data: IncidentOverviewDto | undefined; compact?: boolean }) {
  const c = data?.counts;
  return (
    <div className={compact ? "grid grid-cols-2 gap-3 lg:grid-cols-4" : "mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"}>
      <StatCard label="Open incidents" value={c?.open ?? "–"} icon={AlertTriangle} href="/incidents/register?status=ACTIVE_WORK" />
      <StatCard label="Overdue investigations" value={c?.overdueInvestigations ?? "–"} icon={ClipboardCheck} tone={c?.overdueInvestigations ? "danger" : "success"} href="/incidents/register?view=investigations&investigationStatus=OVERDUE" />
      <StatCard label="Open actions" value={c?.openActions ?? "–"} icon={ListChecks} tone="warning" href="/incidents/actions?state=ACTIVE" />
      <StatCard label="Effectiveness reviews" value={c?.pendingReviews ?? "–"} hint="awaiting review" icon={ThumbsUp} tone="info" href="/incidents/actions?state=AWAITING_EFFECTIVENESS" />
    </div>
  );
}

export function IncidentCharts({ data }: { data: IncidentOverviewDto }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Open incidents by status</CardTitle>
        </CardHeader>
        <CardContent>
          <BarList items={data.charts.byStatus} empty="No open incidents." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Reported per month</CardTitle>
          <CardDescription>Last six months</CardDescription>
        </CardHeader>
        <CardContent>
          <BarList items={data.charts.byMonth} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>By type</CardTitle>
          <CardDescription>Last 12 months</CardDescription>
        </CardHeader>
        <CardContent>
          <BarList items={data.charts.byType.slice(0, 8)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>By severity</CardTitle>
          <CardDescription>Last 12 months</CardDescription>
        </CardHeader>
        <CardContent>
          <BarList items={data.charts.bySeverity} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Incident landing: banner, KPI cards, needs attention, recent reports and up to four charts. */
export function IncidentsOverview() {
  const { can } = useCurrentUser();
  const overview = useIncidentOverview();
  return (
    <>
      <PageBanner
        title="Incidents"
        description="Report what happened, find out why, fix it and check the fix worked."
        actions={
          <>
            {can(PERMISSIONS.INCIDENT_CREATE) && (
              <Button asChild size="lg" className="bg-white text-brand-dark hover:bg-white/90">
                <Link href="/incidents/new">
                  <FilePlus2 /> Report incident
                </Link>
              </Button>
            )}
            <Button asChild size="lg" className="bg-brand-dark text-brand-dark-foreground hover:bg-brand-dark/90">
              <Link href="/incidents/register">
                <FileSearch /> All incidents
              </Link>
            </Button>
          </>
        }
      />
      <PendingReports />
      <IncidentStatCards data={overview.data} />
      {overview.isPending ? (
        <LoadingCards count={4} />
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-brand" /> Needs attention
                </CardTitle>
                <CardDescription>Overdue investigations and actions, reviews that are due, drafts and incidents ready to close.</CardDescription>
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
                          <StatusBadge tone={KIND_TONE[n.kind]}>{n.kind === "close" ? "Close" : n.kind === "draft" ? "Draft" : n.kind === "review" ? "Review" : "Overdue"}</StatusBadge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recently reported</CardTitle>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/incidents/register">
                      View all <ArrowRight />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {overview.data.recent.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No incidents reported yet.</p>
                ) : (
                  <ul className="-mx-2 divide-y">
                    {overview.data.recent.map((i) => (
                      <li key={i.id}>
                        <Link href={`/incidents/${i.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{i.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {i.reference} · {i.typeLabel} · {formatDate(i.occurredAt)} · {i.siteName ?? "No site"}
                            </p>
                          </div>
                          <IncidentStatusBadge status={i.status} className="hidden sm:inline-flex" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <IncidentCharts data={overview.data} />
        </div>
      )}
    </>
  );
}

/** Home: incident KPI cards and the overview charts. */
export function IncidentDashboardWidget() {
  const overview = useIncidentOverview();
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Incidents</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/incidents">
            Open Incidents <ArrowRight />
          </Link>
        </Button>
      </div>
      <IncidentStatCards data={overview.data} compact />
      {overview.isPending ? <LoadingRows rows={2} /> : overview.data ? <IncidentCharts data={overview.data} /> : null}
    </section>
  );
}
