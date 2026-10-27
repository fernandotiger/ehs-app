import { cn } from "@/lib/utils";

export const BADGE_TONES = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-brand-soft text-brand",
  info: "bg-info/15 text-[#1f6fb8] dark:text-info",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-[#9a5b00] dark:text-warning",
  danger: "bg-destructive/10 text-destructive",
  purple: "bg-chart-2/12 text-chart-2",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

/** Soft, rounded status pill (Oleo "Good"/"Recorded" badge style). */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
  dot = false,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
