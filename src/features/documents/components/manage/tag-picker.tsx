"use client";

import { Check, Plus, Tag, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { cleanTagName, tagKey, TAG_NAME_MAX, TAGS_PER_DOCUMENT_MAX } from "@/lib/validation/documents";
import { useDocumentTags } from "../../api";

/**
 * Tags of a document: pick the company's existing tags or type a new one (created when the document
 * is saved). Matching ignores case, so "fire safety" reuses an existing "Fire safety".
 */
export function TagPicker({
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id?: string;
  value: string[];
  onChange: (names: string[]) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const tags = useDocumentTags("library");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const typed = cleanTagName(search);
  const chosen = new Set(value.map(tagKey));
  const existing = (tags.data ?? []).find((t) => tagKey(t.name) === tagKey(typed));
  const full = value.length >= TAGS_PER_DOCUMENT_MAX;

  const add = (name: string) => {
    if (!chosen.has(tagKey(name)) && !full) onChange([...value, name]);
    setSearch("");
  };
  const toggle = (name: string) => (chosen.has(tagKey(name)) ? onChange(value.filter((v) => tagKey(v) !== tagKey(name))) : add(name));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            disabled={disabled}
            className="h-9 w-full justify-start font-normal text-muted-foreground"
          >
            <Tag className="size-4" /> {value.length ? "Add another tag…" : "Add tags…"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search or type a new tag…" value={search} onValueChange={setSearch} maxLength={TAG_NAME_MAX} />
            <CommandList>
              <CommandEmpty>{typed ? "No matching tag." : "No tags yet – type one to create it."}</CommandEmpty>
              {typed && !existing && !chosen.has(tagKey(typed)) && (
                <CommandGroup>
                  <CommandItem value={`__create ${typed}`} onSelect={() => add(typed)} disabled={full}>
                    <Plus className="size-4" /> Create tag &ldquo;{typed}&rdquo;
                  </CommandItem>
                </CommandGroup>
              )}
              {Boolean(tags.data?.length) && (
                <CommandGroup heading="Tags">
                  {tags.data!.map((t) => (
                    <CommandItem key={t.id} value={t.name} onSelect={() => toggle(t.name)} disabled={full && !chosen.has(tagKey(t.name))}>
                      <Check className={cn("size-4", chosen.has(tagKey(t.name)) ? "opacity-100" : "opacity-0")} />
                      <span className="flex-1 truncate">{t.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{t.documentCount}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen tags">
          {value.map((name) => (
            <li key={tagKey(name)} className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-brand-soft pl-2.5 pr-1 text-xs font-medium text-brand">
              <span className="truncate">{name}</span>
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded-full hover:bg-brand/15 disabled:opacity-50"
                aria-label={`Remove tag ${name}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((v) => v !== name))}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
