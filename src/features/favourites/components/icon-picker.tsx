"use client";

import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ICON_NAMES, type IconName } from "@/lib/favourites/icon-names";
import { cn } from "@/lib/utils";
import { FavouriteIcon, ICON_GROUPS, ICONS } from "../icon-map";

function matches(name: IconName, terms: string[]): boolean {
  if (!terms.length) return true;
  const meta = ICONS[name];
  const haystack = `${meta.label} ${meta.words} ${name}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/** "Change icon": a popover with a search box ("fire", "boat") and a grouped grid of icons, plus "Use default". */
export function IconPicker({
  value,
  defaultIcon,
  defaultLabel = "Default for this page",
  onChange,
}: {
  value: IconName | null;
  defaultIcon: IconName;
  defaultLabel?: string;
  onChange: (value: IconName | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = value ?? defaultIcon;

  const groups = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return ICON_GROUPS.map((g) => ({ ...g, names: ICON_NAMES.filter((n) => ICONS[n].group === g.key && matches(n, terms)) })).filter((g) => g.names.length > 0);
  }, [query]);

  function pick(next: IconName | null) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg border bg-muted/40" aria-hidden>
          <FavouriteIcon name={current} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{ICONS[current].label}</p>
          <p className="text-xs text-muted-foreground">{value ? "Your choice" : defaultLabel}</p>
        </div>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="ml-auto">
            Change icon
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center gap-2 border-b p-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search icons, e.g. fire, boat" aria-label="Search icons" className="h-8 pl-8" />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => pick(null)} disabled={value === null}>
            <RotateCcw /> Use default
          </Button>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No icon matches “{query}”.</p>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="mb-2 last:mb-0" aria-label={g.label}>
                <h3 className="px-1 pb-1 text-xs font-medium text-muted-foreground">{g.label}</h3>
                <div className="grid grid-cols-7 gap-1">
                  {g.names.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => pick(name)}
                      aria-label={ICONS[name].label}
                      aria-pressed={name === current}
                      title={ICONS[name].label}
                      className={cn(
                        "flex size-10 items-center justify-center rounded-md text-foreground/80 transition outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                        name === current && "bg-brand-soft text-brand ring-1 ring-brand/40",
                      )}
                    >
                      <FavouriteIcon name={name} />
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
