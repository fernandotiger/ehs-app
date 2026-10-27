"use client";

import { Search } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDocumentCategories } from "../api";

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
