"use client";

import { format } from "date-fns";
import Link from "next/link";
import { StatusBadge } from "@/components/common/status-badge";
import { JOB_RUN_TRIGGER_LABELS } from "@/lib/jobs";
import type { JobRunDetailDto, JobRunDto } from "../api";

export function formatRunTime(run: Pick<JobRunDto, "startedAt" | "timeZone">): string {
  return new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: run.timeZone }).format(new Date(run.startedAt));
}

export function dueAge(daysOverdue: number): string {
  if (daysOverdue > 0) return `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`;
  if (daysOverdue === 0) return "Due today";
  return `Due in ${-daysOverdue} day${daysOverdue === -1 ? "" : "s"}`;
}

export function TriggerBadge({ trigger }: { trigger: JobRunDto["trigger"] }) {
  return <StatusBadge tone={trigger === "TEST" ? "info" : trigger === "MANUAL" ? "purple" : "neutral"}>{JOB_RUN_TRIGGER_LABELS[trigger]}</StatusBadge>;
}

export function OutcomeBadge({ outcome }: { outcome: JobRunDto["outcome"] }) {
  return (
    <StatusBadge tone={outcome === "COMPLETED" ? "success" : "danger"} dot>
      {outcome === "COMPLETED" ? "Completed" : "Failed"}
    </StatusBadge>
  );
}

/** A run's summary and the matched work (who is responsible, where, how late, who was told). */
export function RunDetails({ run }: { run: JobRunDetailDto }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TriggerBadge trigger={run.trigger} />
        <OutcomeBadge outcome={run.outcome} />
        <span className="text-sm text-muted-foreground">
          {formatRunTime(run)} ({run.timeZone})
        </span>
      </div>
      <p className="text-sm">{run.explanation}</p>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Matched", run.matchedCount],
          [run.trigger === "TEST" ? "Delivered (test)" : "Delivered in-app", run.deliveredCount],
          ["Escalated", run.escalatedCount],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border p-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {run.items.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {run.items.map((item, i) => (
            <li key={`${item.entityType}-${item.entityId}-${i}`} className="space-y-1 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={item.href} className="font-medium text-brand underline-offset-2 hover:underline">
                  {item.reference ? `${item.reference} · ` : ""}
                  {item.title}
                </Link>
                {item.escalated && <StatusBadge tone="warning">Escalated</StatusBadge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {[item.providerLabel, `Due ${format(new Date(`${item.dueDate}T00:00:00`), "d MMM yyyy")}`, dueAge(item.daysOverdue), item.siteName, item.responsible ? `Responsible: ${item.responsible}` : "No owner"]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-xs text-muted-foreground">
                {run.trigger === "TEST" ? "Would notify" : "Notified"}: {item.recipients.length ? item.recipients.join(", ") : "nobody (no recipient matched)"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-muted/50 p-3 text-center text-sm text-muted-foreground">No open work matched.</p>
      )}
      {run.matchedCount > run.items.length && <p className="text-xs text-muted-foreground">Showing the first {run.items.length} of {run.matchedCount} matched items.</p>}
    </div>
  );
}
