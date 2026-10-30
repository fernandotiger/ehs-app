import { ChevronRight, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** A number on the blue banner; with `href` it opens the matching filtered list, `hint` explains it on hover. */
export function BannerStat({ label, value, icon: Icon, highlight, href, hint }: { label: string; value: number | string; icon: LucideIcon; highlight?: boolean; href?: string; hint?: string }) {
  const className = cn(
    "flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm",
    highlight && "bg-white/20",
    href && "transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
  );
  const body = (
    <>
      <Icon className="hidden size-5 shrink-0 text-white/80 sm:block" />
      <div className="min-w-0">
        <p className="font-heading text-xl font-semibold leading-none tabular-nums">{value}</p>
        <p className="mt-1 text-[0.7rem] leading-tight text-white/75 sm:text-xs">{label}</p>
      </div>
    </>
  );
  return href ? (
    <Link href={href} className={className} title={hint}>
      {body}
    </Link>
  ) : (
    <div className={className} title={hint}>
      {body}
    </div>
  );
}

/** What each number of a group means, for the ⓘ next to its heading (opens on tap too, unlike a hover title). */
export interface BannerStatHelp {
  label: string;
  text: string;
}

/**
 * A labelled row of three banner stats ("Documents" / "Response forms" on the Document Library); the heading can link to
 * the full list and `help` adds an ⓘ that explains each number in plain words.
 */
export function BannerStatGroup({
  title,
  icon: Icon,
  href,
  help,
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  href?: string;
  help?: BannerStatHelp[];
  className?: string;
  children: React.ReactNode;
}) {
  const heading = (
    <>
      <Icon className="size-3.5" /> {title}
      {href && <ChevronRight className="size-3.5" />}
    </>
  );
  return (
    <section aria-label={title} className={cn("min-w-0", className)}>
      <div className="mb-2 flex items-center gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/80">
          {href ? (
            <Link href={href} className="inline-flex items-center gap-1.5 rounded-sm hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              {heading}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5">{heading}</span>
          )}
        </h2>
        {help && (
          <Popover>
            <PopoverTrigger
              aria-label={`What the ${title.toLowerCase()} numbers mean`}
              className="inline-flex size-6 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Info className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent align="start" collisionPadding={16} className="w-72 text-xs">
              <dl className="space-y-1.5">
                {help.map((item) => (
                  <div key={item.label}>
                    <dt className="font-semibold">{item.label}</dt>
                    <dd className="text-muted-foreground">{item.text}</dd>
                  </div>
                ))}
              </dl>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">{children}</div>
    </section>
  );
}
