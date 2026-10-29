"use client";

import { AlarmClock, ArrowRight, CircleHelp, Scale, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/common/stat-card";
import { LoadingRows } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { SLAW_BASE } from "@/lib/simplified-law";
import { useSlawSummary } from "../api";
import { legislationListHref } from "./shared";

/** Home: the legislation register at a glance (people with register access). */
export function SimplifiedLawDashboardWidget() {
  const summary = useSlawSummary();
  const s = summary.data;
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Simplified law</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href={SLAW_BASE}>
            Open the register <ArrowRight />
          </Link>
        </Button>
      </div>
      {summary.isPending ? (
        <LoadingRows rows={1} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Laws that apply to us" value={s?.applies ?? "–"} hint={s ? `of ${s.laws} laws in force` : undefined} icon={Scale} href={`${legislationListHref()}?check=APPLIES`} />
          <StatCard label="Not checked yet" value={s?.notChecked ?? "–"} hint="Does it apply to us?" icon={CircleHelp} tone="warning" href={`${legislationListHref()}?check=NOT_CHECKED`} />
          <StatCard label="Not compliant" value={s?.notCompliant ?? "–"} hint="Requirements with a gap" icon={ShieldAlert} tone={s?.notCompliant ? "danger" : "success"} href={`${legislationListHref()}?check=NOT_COMPLIANT`} />
          <StatCard label="Open actions" value={s?.openActions ?? "–"} hint={s?.overdueActions ? `${s.overdueActions} overdue` : "None overdue"} icon={AlarmClock} tone={s?.overdueActions ? "danger" : "info"} href={`${SLAW_BASE}/actions?view=all`} />
        </div>
      )}
    </section>
  );
}
