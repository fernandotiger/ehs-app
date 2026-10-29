"use client";

import { AlertTriangle, Check, CircleDashed, ExternalLink, MinusCircle } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { COMPLIANCE_LABELS, SLAW_BASE, type ComplianceKey, type LegalStatusKey, type StatusLabels } from "@/lib/simplified-law";
import type { Progress, RegisterStep } from "@/lib/simplified-law/rules";
import { cn } from "@/lib/utils";
import { COMPLIANCE_TONES, PROGRESS_TONES, STATUS_TONES } from "../format";

/** The storyboard's bar "1. Select category · 2. Legislation · 3. Applicability · 4. Requirements". */
export function StepsBar({ steps, links = {} }: { steps: RegisterStep[]; links?: Partial<Record<RegisterStep["key"], string>> }) {
  return (
    <ol className="mb-5 grid grid-cols-2 gap-1 rounded-xl border bg-card p-1.5 sm:grid-cols-4" aria-label="Steps">
      {steps.map((s, i) => {
        const body = (
          <>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                s.state === "current" && "bg-brand text-brand-foreground",
                s.state === "done" && "bg-success/15 text-success",
                (s.state === "todo" || s.state === "skipped") && "bg-muted text-muted-foreground",
              )}
            >
              {s.state === "done" ? <Check className="size-3" /> : s.state === "skipped" ? <MinusCircle className="size-3" /> : i + 1}
            </span>
            <span className="truncate">{s.label}</span>
          </>
        );
        const href = links[s.key];
        const cls = cn(
          "flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm",
          s.state === "current" && "bg-brand-soft font-semibold text-brand",
          s.state === "done" && "text-foreground",
          (s.state === "todo" || s.state === "skipped") && "text-muted-foreground",
        );
        return (
          <li key={s.key} aria-current={s.state === "current" ? "step" : undefined}>
            {href ? (
              <Link href={href} className={cn(cls, "hover:bg-muted")}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function LegalStatusBadge({ status, labels, note }: { status: LegalStatusKey; labels: StatusLabels; note?: string }) {
  return (
    <StatusBadge tone={STATUS_TONES[status]} dot>
      {labels[status]}
      {note ? <span className="font-normal opacity-80">· {note}</span> : null}
    </StatusBadge>
  );
}

export function ProgressBadge({ progress }: { progress: Progress }) {
  return <StatusBadge tone={PROGRESS_TONES[progress.key]}>{progress.label}</StatusBadge>;
}

export function ComplianceBadge({ compliance }: { compliance: ComplianceKey }) {
  const Icon = compliance === "COMPLIANT" ? Check : compliance === "NOT_COMPLIANT" ? AlertTriangle : compliance === "NOT_APPLICABLE" ? MinusCircle : CircleDashed;
  return (
    <StatusBadge tone={COMPLIANCE_TONES[compliance]}>
      <Icon className="size-3" />
      {COMPLIANCE_LABELS[compliance]}
    </StatusBadge>
  );
}

export function OfficialLink({ href, label = "Official document", className }: { href: string | null; label?: string; className?: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline", className)}>
      {label} <ExternalLink className="size-3.5" />
    </a>
  );
}

/** "What is missing" list from a 422 business-rule error. */
export function Blockers({ title, blockers, className }: { title: string; blockers: string[]; className?: string }) {
  if (!blockers.length) return null;
  return (
    <Alert variant="destructive" className={className} role="status">
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

export const legislationListHref = (categoryId?: string | null) => `${SLAW_BASE}/legislation${categoryId ? `?category=${categoryId}` : ""}`;

/** "Waste › Packaging waste" breadcrumb text for a law. */
export function categoryPath(item: { category: { name: string }; parentCategory: { name: string } | null }): string {
  return item.parentCategory ? `${item.parentCategory.name} › ${item.category.name}` : item.category.name;
}
