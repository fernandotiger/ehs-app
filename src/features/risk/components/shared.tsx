"use client";

import { CheckCircle2, Circle, CircleDot, Lock } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { ASSESSMENT_STATUS_LABELS, PROGRAMME_STATUS_LABELS, STRATEGY_STATUS_LABELS, TASK_STATUS_LABELS, type AssessmentStatus, type ProgrammeStatus, type StrategyStatus, type TaskStatus } from "@/lib/risk/labels";
import { RISK_BAND_LABELS, type RiskBand } from "@/lib/risk/scoring";
import { cn } from "@/lib/utils";
import type { LifecycleStage } from "../api";
import { ASSESSMENT_STATUS_TONES, BAND_CLASSES, PROGRAMME_STATUS_TONES, STRATEGY_STATUS_TONES, TASK_STATUS_TONES } from "../format";

export { BarList, BlockerList, Detail, SectionHeading } from "@/features/incidents/components/shared";

export function AssessmentStatusBadge({ status, className }: { status: AssessmentStatus; className?: string }) {
  return (
    <StatusBadge tone={ASSESSMENT_STATUS_TONES[status]} dot className={className}>
      {ASSESSMENT_STATUS_LABELS[status]}
    </StatusBadge>
  );
}

/** Score + band chip, e.g. "20 · Critical" (checklist: band only). */
export function ScoreChip({ score, band, method, className, size = "sm" }: { score: number | null; band: RiskBand | null; method?: string; className?: string; size?: "sm" | "lg" }) {
  if (score === null || !band) {
    return <span className={cn("inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs text-muted-foreground", className)}>Not scored</span>;
  }
  const label = RISK_BAND_LABELS[band];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold tabular-nums",
        size === "lg" ? "h-9 px-4 text-base" : "h-6 px-2.5 text-xs",
        BAND_CLASSES[band],
        className,
      )}
      title={`Score ${score} · ${label}`}
    >
      {method === "CHECKLIST" ? label : `${score} · ${label}`}
    </span>
  );
}

export function TaskStatusBadge({ status, overdue, className }: { status: TaskStatus; overdue?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      <StatusBadge tone={TASK_STATUS_TONES[status]} dot>
        {TASK_STATUS_LABELS[status]}
      </StatusBadge>
      {overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
    </span>
  );
}

export function StrategyStatusBadge({ status }: { status: StrategyStatus | ProgrammeStatus }) {
  if (status === "PLANNED") return <StatusBadge tone={PROGRAMME_STATUS_TONES.PLANNED}>{PROGRAMME_STATUS_LABELS.PLANNED}</StatusBadge>;
  return <StatusBadge tone={STRATEGY_STATUS_TONES[status]}>{STRATEGY_STATUS_LABELS[status]}</StatusBadge>;
}

export function ConfidentialBadge() {
  return (
    <StatusBadge tone="warning">
      <Lock className="size-3" /> Confidential
    </StatusBadge>
  );
}

/** Horizontal progress bar with the % value (accessible, printable). */
export function ProgressBar({ value, label, className }: { value: number; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
        <div className={cn("h-full rounded-full print:bg-black", pct >= 100 ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-medium tabular-nums">{pct}%</span>
    </div>
  );
}

const STAGE_ICON = { done: CheckCircle2, current: CircleDot, todo: Circle } as const;

/** Draft → Awaiting approval → Approved → Periodic review. */
export function LifecycleStepper({ stages }: { stages: LifecycleStage[] }) {
  return (
    <ol className="mb-5 flex gap-1 overflow-x-auto rounded-xl border bg-card p-2" aria-label="Progress">
      {stages.map((s) => {
        const Icon = STAGE_ICON[s.state];
        return (
          <li
            key={s.key}
            className={cn(
              "flex min-w-fit flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm",
              s.state === "current" && "bg-brand-soft font-semibold text-brand",
              s.state === "done" && "text-success",
              s.state === "todo" && "text-muted-foreground",
            )}
            aria-current={s.state === "current" ? "step" : undefined}
          >
            <Icon className="size-4 shrink-0" />
            <span>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
