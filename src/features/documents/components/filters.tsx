"use client";

import { Check, ChevronDown, Search, Tag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDocumentCategories, useDocumentTags, type TagScope } from "../api";

const ALL = "__all";

export function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <InputGroup className={cn("h-9 bg-card", className)}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </InputGroup>
  );
}

/** Select with an "all" option that maps to `undefined`. */
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  className,
  ariaLabel,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: { id: string; name: string }[];
  allLabel: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className={cn("h-9 w-full bg-card", className)} aria-label={ariaLabel ?? allLabel}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CategoryFilter({ value, onChange, className }: { value: string | undefined; onChange: (v: string | undefined) => void; className?: string }) {
  const categories = useDocumentCategories();
  return <FilterSelect value={value} onChange={onChange} options={categories.data ?? []} allLabel="All categories" className={className} />;
}

/**
 * Filter by one tag. Searchable, because a company can collect many tags. `scope`: "library" lists every
 * tag in use; "mine" only tags on documents assigned to the user.
 */
export function TagFilter({ value, onChange, scope, className }: { value: string | undefined; onChange: (v: string | undefined) => void; scope: TagScope; className?: string }) {
  const tags = useDocumentTags(scope);
  const [open, setOpen] = useState(false);
  const options = (tags.data ?? []).filter((t) => t.documentCount > 0 || t.id === value);
  const selected = (tags.data ?? []).find((t) => t.id === value);
  const pick = (id: string | undefined) => {
    onChange(id);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label="Tag" className={cn("h-9 w-full justify-between bg-card px-3 font-normal", className)}>
          <span className="flex min-w-0 items-center gap-1.5">
            <Tag className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{selected?.name ?? "All tags"}</span>
          </span>
          <ChevronDown className="pointer-events-none size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tags…" />
          <CommandList>
            <CommandEmpty>{options.length ? "No matching tag." : "No tags yet."}</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all" onSelect={() => pick(undefined)}>
                <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} /> All tags
              </CommandItem>
              {options.map((t) => (
                <CommandItem key={t.id} value={t.name} onSelect={() => pick(t.id)}>
                  <Check className={cn("size-4", t.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{t.documentCount}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
