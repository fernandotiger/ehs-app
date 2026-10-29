"use client";

import { Check } from "lucide-react";
import { TILE_COLOUR_NAMES, TILE_COLOURS, type TileColourName } from "@/lib/favourites/colours";
import { cn } from "@/lib/utils";

/** Round colour swatches (Default = company colour). Arrow keys move between them, like a radio group. */
export function ColourPicker({ value, onChange, labelId }: { value: TileColourName; onChange: (value: TileColourName) => void; labelId?: string }) {
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = TILE_COLOUR_NAMES.indexOf(value);
    const next = TILE_COLOUR_NAMES[(index + step + TILE_COLOUR_NAMES.length) % TILE_COLOUR_NAMES.length]!;
    onChange(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-colour="${next}"]`)?.focus();
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2" onKeyDown={onKeyDown}>
      {TILE_COLOUR_NAMES.map((name) => {
        const colour = TILE_COLOURS[name];
        const selected = name === value;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={colour.label}
            title={colour.label}
            data-colour={name}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(name)}
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-white shadow-xs ring-offset-2 ring-offset-background transition outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
              colour.swatch,
              selected && "ring-2 ring-foreground/70",
            )}
          >
            {selected && <Check className="size-4" strokeWidth={3} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
