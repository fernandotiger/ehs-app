import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  brand: "bg-brand-soft text-brand",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info/15 text-info",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  href?: string;
  className?: string;
}) {
  const body = (
    <Card className={cn("h-full gap-0 py-0 transition-shadow", href && "hover:shadow-md", className)}>
      <CardContent className="flex items-center gap-4 p-4">
        {Icon && (
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="font-heading text-2xl font-semibold leading-tight">{value}</p>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
