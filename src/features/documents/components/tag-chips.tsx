import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";

/** A document's tags as small chips; beyond `max` the rest collapse into "+N". */
export function TagChips({ tags, max = 3, className }: { tags: readonly { id: string; name: string }[]; max?: number; className?: string }) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  const hidden = tags.length - shown.length;
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)} aria-label={`Tags: ${tags.map((t) => t.name).join(", ")}`}>
      {shown.map((t) => (
        <span key={t.id} className="inline-flex h-5 max-w-40 items-center gap-1 rounded-full border bg-background px-2 text-[0.7rem] font-medium text-muted-foreground">
          <Tag className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{t.name}</span>
        </span>
      ))}
      {hidden > 0 && (
        <span className="text-[0.7rem] text-muted-foreground" title={tags.slice(max).map((t) => t.name).join(", ")}>
          +{hidden}
        </span>
      )}
    </span>
  );
}
