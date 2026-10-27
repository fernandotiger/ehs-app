"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
  description?: string;
}

/** Searchable multi-select for static option lists (roles, departments, locations…). */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  emptyText = "No results.",
  className,
  id,
  disabled,
}: {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-auto min-h-9 w-full justify-between px-2 py-1.5 font-normal", className)}
        >
          <span className="flex flex-wrap gap-1">
            {selected.length === 0 && <span className="px-1 text-muted-foreground">{placeholder}</span>}
            {selected.map((o) => (
              <Badge key={o.value} variant="secondary" className="gap-1 pr-1">
                {o.label}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Remove ${o.label}`}
                  className="rounded-full hover:bg-foreground/10"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(o.value);
                  }}
                >
                  <X className="size-3" />
                </span>
              </Badge>
            ))}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)}>
                  <Check className={cn("size-4", value.includes(o.value) ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="truncate">{o.label}</p>
                    {o.description && <p className="truncate text-xs text-muted-foreground">{o.description}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
