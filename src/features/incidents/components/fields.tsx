"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLookup, structureOptions, useLookups } from "@/features/shared/lookups";
import type { LookupListKey } from "@/lib/lookups";
import { cn } from "@/lib/utils";

const NONE = "__none";

/** Plain select over static options; `allowNone` adds an empty choice. */
export function SimpleSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Choose…",
  allowNone,
  noneLabel = "None",
  disabled,
  className,
  invalid,
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
  invalid?: boolean;
}) {
  return (
    <Select value={value ?? (allowNone ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} className={cn("w-full", className)} aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function enumOptions<K extends string>(keys: readonly K[], labels: Record<K, string>) {
  return keys.map((k) => ({ value: k, label: labels[k] }));
}

/** Department picker – the department sets location, site and business unit. */
export function DepartmentSelect(props: Omit<Parameters<typeof SimpleSelect>[0], "options">) {
  const lookups = useLookups();
  const options = structureOptions(lookups.data).departments.map((d) => ({ value: d.id, label: d.name }));
  return <SimpleSelect placeholder="Choose a department…" {...props} options={options} />;
}

export function SiteSelect(props: Omit<Parameters<typeof SimpleSelect>[0], "options">) {
  const lookups = useLookups();
  const options = structureOptions(lookups.data).sites.map((s) => ({ value: s.id, label: s.name }));
  return <SimpleSelect placeholder="All sites" {...props} options={options} />;
}

/** Values of a configurable pick-list, stored by label (the current value stays selectable when deactivated). */
export function LookupLabelSelect({ listKey, value, ...rest }: Omit<Parameters<typeof SimpleSelect>[0], "options"> & { listKey: LookupListKey }) {
  const list = useLookup(listKey);
  const options = (list.data ?? []).map((v) => ({ value: v.label, label: v.label }));
  if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: `${value} (no longer offered)` });
  return <SimpleSelect value={value} {...rest} options={options} />;
}

/** Department name for an id (structure lookups, cached). */
export function useDepartmentName(id: string | null | undefined): string | null {
  const lookups = useLookups();
  if (!id) return null;
  return structureOptions(lookups.data).departments.find((d) => d.id === id)?.name ?? null;
}

/** Site id of a department (for site-specific questions). */
export function useDepartmentSite(id: string | null | undefined): string | null {
  const lookups = useLookups();
  if (!id) return null;
  return lookups.data?.departments.find((d) => d.id === id)?.siteId ?? null;
}
