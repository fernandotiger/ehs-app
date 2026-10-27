"use client";

import { AlertTriangle, CheckCircle2, Circle, CircleDot, MinusCircle } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ACTION_STATE_LABELS, INCIDENT_STATUS_LABELS, SEVERITY_LABELS, type ActionStateKey, type IncidentStatusKey, type Severity } from "@/lib/incidents";
import { cn } from "@/lib/utils";
import type { LifecycleStage } from "../api";
import { ACTION_STATE_TONES, INCIDENT_STATUS_TONES, SEVERITY_TONES } from "../format";

export function IncidentStatusBadge({ status, className }: { status: IncidentStatusKey; className?: string }) {
  return (
    <StatusBadge tone={INCIDENT_STATUS_TONES[status]} dot className={className}>
      {INCIDENT_STATUS_LABELS[status]}
    </StatusBadge>
  );
}

export function ActionStateBadge({ state, overdue, className }: { state: ActionStateKey; overdue?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      <StatusBadge tone={ACTION_STATE_TONES[state]} dot>
        {ACTION_STATE_LABELS[state]}
      </StatusBadge>
      {overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <StatusBadge tone={SEVERITY_TONES[severity]}>{SEVERITY_LABELS[severity]}</StatusBadge>;
}

/** Explains exactly what is missing before a step can happen. */
export function BlockerList({ title, blockers, className, tone = "warning" }: { title: string; blockers: string[]; className?: string; tone?: "warning" | "destructive" }) {
  if (!blockers.length) return null;
  return (
    <Alert variant={tone === "destructive" ? "destructive" : "default"} className={cn(tone === "warning" && "border-warning/40 bg-warning/5", className)} role="status">
      <AlertTriangle className="size-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** Simple horizontal bar chart (accessible, printable, themed by CSS variables). */
export function BarList({ items, empty = "No data for this period.", max }: { items: { label: string; value: number }[]; empty?: string; max?: number }) {
  if (!items.length || items.every((i) => i.value === 0)) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2" role="list">
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(6rem,10rem)_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate text-muted-foreground" title={item.label}>
            {item.label}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-brand print:bg-black" style={{ width: `${Math.max(2, (item.value / top) * 100)}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function Detail({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-0.5 sm:grid-cols-[minmax(0,12rem)_1fr] sm:gap-4", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-sm">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const STAGE_ICON = { done: CheckCircle2, current: CircleDot, todo: Circle, skipped: MinusCircle } as const;

/** Reported → Investigation → Actions → Effectiveness → Closed. */
export function LifecycleStepper({ stages }: { stages: LifecycleStage[] }) {
  return (
    <ol className="mb-5 flex gap-1 overflow-x-auto rounded-xl border bg-card p-2" aria-label="Progress">
      {stages.map((s, i) => {
        const Icon = STAGE_ICON[s.state];
        return (
          <li
            key={s.key}
            className={cn(
              "flex min-w-fit flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm",
              s.state === "current" && "bg-brand-soft font-semibold text-brand",
              s.state === "done" && "text-success",
              (s.state === "todo" || s.state === "skipped") && "text-muted-foreground",
            )}
            aria-current={s.state === "current" ? "step" : undefined}
          >
            <Icon className="size-4 shrink-0" />
            <span>{s.label}</span>
            {s.state === "skipped" && <span className="sr-only">(not needed)</span>}
            {i < stages.length - 1 && <span className="ml-auto hidden h-px w-4 bg-border lg:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function SectionHeading({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
