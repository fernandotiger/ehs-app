"use client";

import { Check, ChevronsUpDown, UserRound, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useUserSearch, useUsersByIds, type UserOption } from "@/features/shared/lookups";
import { cn } from "@/lib/utils";

function useUserPickerState(permission?: string) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const results = useUserSearch(deferred, { permission, enabled: open });
  return { open, setOpen, search, setSearch, results };
}

function UserResults({
  results,
  isSelected,
  onSelect,
}: {
  results: ReturnType<typeof useUserSearch>;
  isSelected: (id: string) => boolean;
  onSelect: (user: UserOption) => void;
}) {
  return (
    <CommandList>
      {results.isFetching && !results.data && (
        <div className="flex justify-center p-4">
          <Spinner />
        </div>
      )}
      <CommandEmpty>No people found.</CommandEmpty>
      <CommandGroup>
        {results.data?.map((u) => (
          <CommandItem key={u.id} value={u.id} onSelect={() => onSelect(u)}>
            <Check className={cn("size-4", isSelected(u.id) ? "opacity-100" : "opacity-0")} />
            <div className="min-w-0">
              <p className="truncate">{u.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[u.jobTitle, u.department?.name].filter(Boolean).join(" · ") || u.email}
              </p>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  );
}

/** Single person picker with server-side search (scales to large directories). */
export function UserPicker({
  value,
  onChange,
  placeholder = "Select a person…",
  permission,
  id,
  disabled,
  allowClear = true,
}: {
  value: string | null | undefined;
  onChange: (id: string | null, user?: UserOption) => void;
  placeholder?: string;
  /** Only show users holding this permission (e.g. incident.investigate). */
  permission?: string;
  id?: string;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  const state = useUserPickerState(permission);
  const selected = useUsersByIds(value ? [value] : []);
  const current = selected.data?.find((u) => u.id === value);

  return (
    <Popover open={state.open} onOpenChange={state.setOpen}>
      <div className="flex gap-1">
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" disabled={disabled} className="w-full justify-between font-normal">
            <span className={cn("flex min-w-0 items-center gap-2", !current && "text-muted-foreground")}>
              <UserRound className="size-4 shrink-0" />
              <span className="truncate">{current ? current.name : value ? "Loading…" : placeholder}</span>
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        {allowClear && value && !disabled && (
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Clear">
            <X />
          </Button>
        )}
      </div>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by name or email…" value={state.search} onValueChange={state.setSearch} />
          <UserResults
            results={state.results}
            isSelected={(uid) => uid === value}
            onSelect={(u) => {
              onChange(u.id, u);
              state.setOpen(false);
            }}
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Multiple people picker. */
export function UserMultiPicker({
  value,
  onChange,
  placeholder = "Add people…",
  permission,
  id,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  permission?: string;
  id?: string;
  disabled?: boolean;
}) {
  const state = useUserPickerState(permission);
  const selected = useUsersByIds(value);
  const byId = new Map(selected.data?.map((u) => [u.id, u]));
  const toggle = (uid: string) => onChange(value.includes(uid) ? value.filter((x) => x !== uid) : [...value, uid]);

  return (
    <Popover open={state.open} onOpenChange={state.setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between px-2 py-1.5 font-normal"
        >
          <span className="flex flex-wrap gap-1">
            {value.length === 0 && <span className="px-1 text-muted-foreground">{placeholder}</span>}
            {value.map((uid) => (
              <Badge key={uid} variant="secondary" className="gap-1 pr-1">
                {byId.get(uid)?.name ?? "…"}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Remove"
                  className="rounded-full hover:bg-foreground/10"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(uid);
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
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by name or email…" value={state.search} onValueChange={state.setSearch} />
          <UserResults results={state.results} isSelected={(uid) => value.includes(uid)} onSelect={(u) => toggle(u.id)} />
        </Command>
      </PopoverContent>
    </Popover>
  );
}
