import { cn } from "@/lib/utils";

/** Dotted-ring mark inspired by the Oleo reference logo. */
export function BrandMark({ className }: { className?: string }) {
  const dots = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return { cx: 16 + Math.cos(angle) * 11, cy: 16 + Math.sin(angle) * 11, big: i % 2 === 0 };
  });
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      {dots.map((d, i) => (
        <ellipse
          key={i}
          cx={d.cx}
          cy={d.cy}
          rx={d.big ? 3.4 : 2}
          ry={d.big ? 2.2 : 2}
          transform={`rotate(${(i / 8) * 360} ${d.cx} ${d.cy})`}
          className="fill-current"
        />
      ))}
    </svg>
  );
}

export function BrandLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-brand", className)}>
      <BrandMark className="size-7" />
      {!compact && (
        <span className="font-heading text-xl font-semibold leading-none tracking-tight">
          OleoQ<span className="text-brand-light">.</span>
        </span>
      )}
    </span>
  );
}
