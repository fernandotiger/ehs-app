import type { ComplianceStats } from "@/server/modules/documents/document.dto";
import { cn } from "@/lib/utils";

/** "143 required / 127 acknowledged / 16 outstanding" with a progress bar. */
export function ComplianceProgress({ stats, compact = false, className }: { stats: ComplianceStats; compact?: boolean; className?: string }) {
  const tone = stats.percent >= 90 ? "bg-success" : stats.overdue > 0 ? "bg-warning" : "bg-brand";
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <div className="flex items-start justify-between gap-2 text-xs">
        <span className="leading-snug text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{stats.required}</span> required /{" "}
          <span className="font-medium text-success tabular-nums">{stats.acknowledged}</span> acknowledged /{" "}
          <span className="font-medium text-foreground tabular-nums">{stats.outstanding}</span> outstanding
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{stats.percent}%</span>
      </div>
      <div
        className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", compact && "h-1.5")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stats.percent}
        aria-label="Acknowledgement progress"
      >
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${stats.percent}%` }} />
      </div>
      {!compact && stats.overdue > 0 && <p className="text-xs font-medium text-destructive">{stats.overdue} overdue</p>}
    </div>
  );
}
