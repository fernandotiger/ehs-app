"use client";

import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDocumentCategories } from "../../api";

/** Pick an existing category or type a new name (created when the document is saved). */
export function CategoryCombobox({ id, value, onChange, invalid }: { id?: string; value: string; onChange: (name: string) => void; invalid?: boolean }) {
  const categories = useDocumentCategories();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const typed = search.trim();
  const exists = (categories.data ?? []).some((c) => c.name.toLowerCase() === typed.toLowerCase());

  const select = (name: string) => {
    onChange(name);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex gap-1">
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid} className="h-9 w-full justify-between font-normal">
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Select or create a category…"}</span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        {value && (
          <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Clear category" onClick={() => onChange("")}>
            <X />
          </Button>
        )}
      </div>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or type a new category…" value={search} onValueChange={setSearch} maxLength={80} />
          <CommandList>
            <CommandEmpty>{typed ? "No matching category." : "No categories yet."}</CommandEmpty>
            {typed && !exists && (
              <CommandGroup>
                <CommandItem value={`__create ${typed}`} onSelect={() => select(typed)}>
                  <Plus className="size-4" /> Create &ldquo;{typed}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Categories">
              {(categories.data ?? []).map((c) => (
                <CommandItem key={c.id} value={c.name} onSelect={() => select(c.name)}>
                  <Check className={cn("size-4", value.toLowerCase() === c.name.toLowerCase() ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{c.documentCount}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
