import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Navy hero banner with hexagon pattern (Oleo "Welcome Back" header).
 * Use at the top of module landing pages and the dashboard.
 */
export function PageBanner({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional content that overlaps the bottom edge (e.g. a filter card). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-6", className)}>
      <div className="@container/banner relative overflow-hidden rounded-2xl bg-brand px-5 py-6 text-brand-foreground shadow-sm md:px-8 md:py-8">
        <div className="bg-hex-pattern pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/5" aria-hidden />
        {/* Title and actions sit side by side once the banner itself is wide enough (not the window: the sidebar takes
            room on tablets); the actions keep one row while they fit in 55% (two buttons on the Document Library). */}
        <div className="relative flex flex-col gap-4 @2xl/banner:flex-row @2xl/banner:items-end @2xl/banner:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
            {description && <p className="mt-1.5 max-w-2xl text-sm text-brand-foreground/75">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2 @2xl/banner:max-w-[55%] @2xl/banner:shrink-0 @2xl/banner:justify-end">{actions}</div>}
        </div>
        {children && <div className="relative mt-5">{children}</div>}
      </div>
    </section>
  );
}

/** Compact header for detail and form pages. */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = "Back",
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      {backHref && (
        <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
