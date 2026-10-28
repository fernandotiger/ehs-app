"use client";

import { AlarmClock, ArrowRight, CalendarClock, Send, UserCheck } from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/common/stat-card";
import { LoadingRows } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useActionSummary } from "../api";

/** Home: my open actions at a glance (assigned, overdue, due this week, created for others). */
export function ActionsDashboardWidget() {
  const summary = useActionSummary();
  const s = summary.data;
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Actions</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/actions">
            Open My Actions <ArrowRight />
          </Link>
        </Button>
      </div>
      {summary.isPending ? (
        <LoadingRows rows={1} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Assigned to me" value={s?.assigned ?? "–"} hint="To do or in progress" icon={UserCheck} href="/actions?view=assigned" />
          <StatCard label="Overdue" value={s?.overdue ?? "–"} hint="Past the due date" icon={AlarmClock} tone={s?.overdue ? "danger" : "success"} href="/actions?view=assigned&overdue=true" />
          <StatCard label="Due this week" value={s?.dueSoon ?? "–"} hint="Today and the next 6 days" icon={CalendarClock} tone="warning" href="/actions?view=assigned" />
          <StatCard label="Created for others" value={s?.createdForOthers ?? "–"} hint="Still open" icon={Send} tone="info" href="/actions?view=created" />
        </div>
      )}
    </section>
  );
}
