"use client";

import { CheckCircle2, Circle, CircleDot, History, Info } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLookups, useUsersByIds } from "@/features/shared/lookups";
import { EVALUATION_STATUS_LABELS, LAW_DISCLAIMER, LAW_TASK_PRIORITY_LABELS, ratingBand, type EvaluationStatusKey, type LawTaskPriorityKey } from "@/lib/law";
import { cn } from "@/lib/utils";
import { useLawHistory, type LawHistoryKind, type LifecycleStep } from "../api";
import { describeChanges, EVALUATION_STATUS_TONES, formatDateTime, LAW_HISTORY_LABELS, LAW_PRIORITY_TONES, RATING_TONES, rememberedProfile, rememberProfile } from "../format";

// ── Badges ──────────────────────────────────────────────────────────────────

export function EvaluationStatusBadge({ status, reviewOverdue, className }: { status: EvaluationStatusKey; reviewOverdue?: boolean; className?: string }) {
  if (reviewOverdue && status === "COMPLETE") {
    return (
      <StatusBadge tone="warning" dot className={className}>
        Review overdue
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone={EVALUATION_STATUS_TONES[status]} dot className={className}>
      {EVALUATION_STATUS_LABELS[status]}
    </StatusBadge>
  );
}

/** Self-assessed rating, or "Not rated". */
export function RatingBadge({ rating, className }: { rating: number | null; className?: string }) {
  if (rating === null) return <span className={cn("text-xs text-muted-foreground", className)}>Not rated</span>;
  return (
    <StatusBadge tone={RATING_TONES[ratingBand(rating)]} className={className}>
      {rating}%
    </StatusBadge>
  );
}

export function LawTaskStatusBadge({ status, overdue, archived }: { status: "OPEN" | "COMPLETED"; overdue?: boolean; archived?: boolean }) {
  if (archived) return <StatusBadge tone="neutral">Archived</StatusBadge>;
  if (status === "COMPLETED") return <StatusBadge tone="success" dot>Done</StatusBadge>;
  return overdue ? (
    <StatusBadge tone="danger" dot>
      Overdue
    </StatusBadge>
  ) : (
    <StatusBadge tone="info" dot>
      To do
    </StatusBadge>
  );
}

export function LawPriorityBadge({ priority }: { priority: LawTaskPriorityKey }) {
  return <StatusBadge tone={LAW_PRIORITY_TONES[priority]}>{LAW_TASK_PRIORITY_LABELS[priority]} priority</StatusBadge>;
}

// ── Profile choice (URL ?profile=, remembered per browser) ──────────────────

const PROFILE_EVENT = "oleoq:law-profile";

function subscribeProfile(callback: () => void) {
  window.addEventListener(PROFILE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(PROFILE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * The selected legal profile for Overview / register / library / reports. The URL wins; otherwise
 * the last choice in this browser; otherwise the server picks the first profile (null).
 */
export function useProfileParam(): [string | null, (id: string | null) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = params.get("profile");
  // localStorage is read on the client only (null while rendering on the server).
  const remembered = useSyncExternalStore(subscribeProfile, rememberedProfile, () => null);
  const value = fromUrl ?? remembered;
  const set = (id: string | null) => {
    rememberProfile(id);
    window.dispatchEvent(new Event(PROFILE_EVENT));
    const next = new URLSearchParams(params.toString());
    if (id) next.set("profile", id);
    else next.delete("profile");
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
  };
  return [value, set];
}

export function ProfileSelect({
  value,
  onChange,
  profiles,
  className,
}: {
  value: string | null | undefined;
  onChange: (id: string) => void;
  profiles: { id: string; name: string; siteName?: string | null }[];
  className?: string;
}) {
  if (!profiles.length) return null;
  const current = value && profiles.some((p) => p.id === value) ? value : profiles[0]!.id;
  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className={cn("h-9 w-full bg-card sm:w-72", className)} aria-label="Legal profile">
        <SelectValue placeholder="Choose a profile" />
      </SelectTrigger>
      <SelectContent>
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
            {p.siteName ? <span className="text-muted-foreground"> · {p.siteName}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "This is your own assessment, not legal advice." */
export function LawDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-xs text-muted-foreground", className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" /> {LAW_DISCLAIMER}
    </p>
  );
}

// ── Stepper ─────────────────────────────────────────────────────────────────

const STEP_ICON = { done: CheckCircle2, current: CircleDot, todo: Circle } as const;

export function LawStepper({ steps }: { steps: LifecycleStep[] }) {
  return (
    <ol className="mb-5 flex gap-1 overflow-x-auto rounded-xl border bg-card p-2" aria-label="Progress">
      {steps.map((s) => {
        const Icon = STEP_ICON[s.state];
        return (
          <li
            key={s.key}
            className={cn(
              "flex min-w-fit flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm",
              s.state === "current" && (s.key === "REVIEW" ? "bg-warning/15 font-semibold text-[#9a5b00]" : "bg-brand-soft font-semibold text-brand"),
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

// ── History ─────────────────────────────────────────────────────────────────

export function LawHistory({ kind, id }: { kind: LawHistoryKind; id: string }) {
  const [page, setPage] = useState(1);
  const history = useLawHistory(kind, id, page);
  const lookups = useLookups();
  const personIds = [
    ...new Set(
      (history.data?.items ?? []).flatMap((e) => {
        const owner = (e.changes as { ownerId?: unknown } | null)?.ownerId;
        if (typeof owner === "string") return [owner];
        if (owner && typeof owner === "object") return [(owner as { from?: unknown }).from, (owner as { to?: unknown }).to].filter((x): x is string => typeof x === "string");
        return [];
      }),
    ),
  ];
  const people = useUsersByIds(personIds);
  const names = (pid: string) => people.data?.find((u) => u.id === pid)?.name ?? lookups.data?.departments.find((d) => d.id === pid)?.name ?? null;

  if (history.isPending) return <LoadingRows rows={5} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (!history.data.items.length) return <EmptyState icon={History} title="No history yet" />;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>History</CardTitle>
        <CardDescription>Signed audit trail – every save is kept, nothing is overwritten.</CardDescription>
      </CardHeader>
      <ul className="divide-y">
        {history.data.items.map((e) => {
          const meta = (e.metadata ?? {}) as Record<string, unknown>;
          const lines = e.action.endsWith("_CREATED") || e.action === "LAW_REQUIREMENT_ADDED" ? [] : describeChanges(e.changes, names);
          return (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{LAW_HISTORY_LABELS[e.action] ?? e.action.replace(/_/g, " ").toLowerCase()}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(e.createdAt)} · {e.actorName ?? "System"}
                </p>
              </div>
              {lines.map((line) => (
                <p key={line} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
              {typeof meta.reason === "string" && <p className="text-xs text-muted-foreground">Reason: {meta.reason}</p>}
              {typeof meta.notes === "string" && <p className="text-xs text-muted-foreground">“{meta.notes}”</p>}
              {typeof meta.label === "string" && (
                <p className="text-xs text-muted-foreground">
                  {meta.label}
                  {typeof meta.context === "string" && meta.context ? ` – ${meta.context}` : ""}
                </p>
              )}
              {typeof meta.reference === "string" && <p className="text-xs text-muted-foreground">{meta.reference}</p>}
              {typeof meta.version === "string" && <p className="text-xs text-muted-foreground">Content version {meta.version}</p>}
            </li>
          );
        })}
      </ul>
      <div className="border-t px-3">
        <PaginationBar page={page} pageSize={history.data.pageSize} total={history.data.total} onPageChange={setPage} />
      </div>
    </Card>
  );
}
