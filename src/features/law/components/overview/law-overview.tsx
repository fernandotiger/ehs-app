"use client";

import { AlarmClock, ArrowRight, BookOpenCheck, CalendarClock, CircleAlert, ClipboardCheck, FileClock, Gauge, Plus, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { PageBanner } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useLawOverview, useLawSummary, type LawAttentionItem } from "../../api";
import { formatDate } from "../../format";
import { EvaluationStatusBadge, LawDisclaimer, ProfileSelect, useProfileParam } from "../shared";

const ATTENTION_ICON: Record<LawAttentionItem["kind"], typeof CircleAlert> = {
  "update-available": FileClock,
  "review-required": CircleAlert,
  "review-overdue": CalendarClock,
  "task-overdue": AlarmClock,
  "not-started": ClipboardCheck,
};

/** Law landing page: one profile at a time – figures, what needs attention, recent checks. */
export function LawOverview() {
  const [profileId, setProfileId] = useProfileParam();
  const overview = useLawOverview(profileId);
  const data = overview.data;
  const p = data?.profile ?? null;
  const s = p?.summary;
  const profileQuery = p ? `?profile=${p.id}` : "";

  return (
    <>
      <PageBanner
        title="Law & compliance"
        description="See which laws apply to each site, check that you comply and keep track of the work to close any gaps."
        actions={
          <>
            {Boolean(data?.profiles.length) && (
              <Button asChild variant="secondary">
                <Link href={`/law/requirements${profileQuery}`}>
                  <ClipboardCheck /> Check compliance
                </Link>
              </Button>
            )}
            {data?.canCreateProfile && (
              <Button asChild variant="outline" className="border-white/30 bg-transparent text-brand-foreground hover:bg-white/10 hover:text-brand-foreground">
                <Link href="/law/profiles?new=1">
                  <Plus /> New profile
                </Link>
              </Button>
            )}
          </>
        }
      />

      {overview.isPending ? (
        <LoadingRows rows={6} />
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      ) : !p ? (
        data!.canCreateProfile ? (
          <EmptyState
            icon={Scale}
            title={data!.libraryInstalled ? "No legal profile yet" : "No legal content installed yet"}
            description={
              data!.libraryInstalled
                ? "A profile describes a site and what happens there, so the app can find the laws that apply. Create one to start."
                : "An administrator installs the legal content in Configuration → Law content & settings. Then profiles can be created."
            }
            action={
              data!.libraryInstalled ? (
                <Button asChild>
                  <Link href="/law/profiles?new=1">
                    <Plus /> Create a profile
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <EmptyState
              icon={Scale}
              title="Nothing to check here for you"
              description="Your company's legal requirements are looked after by your managers. Compliance tasks given to you are listed under Law → Tasks."
              action={
                <Button asChild>
                  <Link href="/law/tasks">
                    <ClipboardCheck /> My Law tasks
                  </Link>
                </Button>
              }
            />
            <div className="mt-6">
              <LawDashboardWidget />
            </div>
          </>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <ProfileSelect value={p.id} onChange={setProfileId} profiles={data!.profiles} />
            <p className="text-xs text-muted-foreground">
              {p.site?.name ?? "No site"} · {p.jurisdiction} · legal content {p.contentVersion}
            </p>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Apply to us" value={s!.total} hint={s!.excluded ? `${s!.excluded} marked as not applying` : "Requirements in this profile"} icon={BookOpenCheck} href={`/law/requirements${profileQuery}`} />
            <StatCard
              label="Checked"
              value={s!.total ? `${s!.complete} of ${s!.total}` : "–"}
              hint="Why it applies, how we checked, owner and next review recorded"
              icon={ShieldCheck}
              tone={s!.total && s!.complete === s!.total ? "success" : "info"}
              href={`/law/requirements${profileQuery}${profileQuery ? "&" : "?"}status=COMPLETE`}
            />
            <StatCard
              label="Need attention"
              value={s!.review + p.overdueTasks}
              hint={`${s!.review} to review · ${p.overdueTasks} overdue task${p.overdueTasks === 1 ? "" : "s"}`}
              icon={CircleAlert}
              tone={s!.review + p.overdueTasks ? "warning" : "success"}
              href={`/law/requirements${profileQuery}${profileQuery ? "&" : "?"}attention=true`}
            />
            {p.showRating ? (
              <StatCard
                label="Self-assessed compliance"
                value={s!.score === null ? "Not assessed" : `${s!.score}%`}
                hint={`Rated ${s!.rated} of ${s!.total}`}
                icon={Gauge}
                tone={s!.score === null ? "brand" : s!.score >= 80 ? "success" : s!.score >= 50 ? "warning" : "danger"}
              />
            ) : (
              <StatCard label="Reviews in the next 30 days" value={data!.upcomingReviews} hint="Next review dates coming up" icon={CalendarClock} tone="info" />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Needs attention</CardTitle>
                <CardDescription>What to look at next in {p.name}.</CardDescription>
              </CardHeader>
              <CardContent>
                {data!.attention.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nothing needs attention right now. Well done.</p>
                ) : (
                  <ul className="-mx-2 divide-y">
                    {data!.attention.map((a) => {
                      const Icon = ATTENTION_ICON[a.kind];
                      return (
                        <li key={`${a.kind}-${a.href}-${a.label}`}>
                          <Link href={a.href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                            <span
                              className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-full",
                                a.kind === "task-overdue" ? "bg-destructive/10 text-destructive" : a.kind === "not-started" || a.kind === "update-available" ? "bg-brand-soft text-brand" : "bg-warning/15 text-[#9a5b00]",
                              )}
                            >
                              <Icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{a.label}</span>
                              <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
                            </span>
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recently checked</CardTitle>
                <CardDescription>The latest compliance checks in this profile.</CardDescription>
              </CardHeader>
              <CardContent>
                {data!.recent.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No requirement has been fully checked yet.</p>
                ) : (
                  <ul className="-mx-2 divide-y">
                    {data!.recent.map((r) => (
                      <li key={r.id}>
                        <Link href={r.href} className="block rounded-lg px-2 py-2.5 hover:bg-muted/50">
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-medium">{r.title}</span>
                            <EvaluationStatusBadge status={r.status} />
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {r.reference}
                            {r.evaluatedOn ? ` · checked ${formatDate(r.evaluatedOn)}` : ""}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <LawDisclaimer className="mt-4" />
        </>
      )}
    </>
  );
}

/** Home: my Law work at a glance. */
export function LawDashboardWidget() {
  const summary = useLawSummary();
  const s = summary.data;
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Law & compliance</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/law">
            Open Law <ArrowRight />
          </Link>
        </Button>
      </div>
      {summary.isPending ? (
        <LoadingRows rows={1} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="My Law tasks" value={s?.mine ?? "–"} hint="Still to do" icon={ClipboardCheck} href="/law/tasks" />
          <StatCard label="Overdue tasks" value={s?.overdue ?? "–"} hint="Past the due date" icon={AlarmClock} tone={s?.overdue ? "danger" : "success"} href="/law/tasks?due=overdue" />
          <StatCard label="Due this week" value={s?.dueSoon ?? "–"} hint="Today and the next 6 days" icon={CalendarClock} tone="warning" href="/law/tasks?due=week" />
          <StatCard label="My requirements to review" value={s?.reviewsDue ?? "–"} hint="Law changed or review due within 30 days" icon={Scale} tone="info" href="/law/requirements?mine=true" />
        </div>
      )}
    </section>
  );
}
