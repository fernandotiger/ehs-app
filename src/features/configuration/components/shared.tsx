"use client";

import { Search } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Header for every Configuration screen (back link to the hub). */
export function ConfigHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return <PageHeader title={title} description={description} backHref="/configuration" backLabel="Configuration" actions={actions} />;
}

export function ActiveBadge({ active, activeLabel = "Active", inactiveLabel = "Inactive" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return (
    <StatusBadge tone={active ? "success" : "neutral"} dot>
      {active ? activeLabel : inactiveLabel}
    </StatusBadge>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <InputGroup className={cn("h-9 bg-card", className)}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </InputGroup>
  );
}

const ALL = "__all";

/** Select with an "all" option that maps to `undefined`. */
export function OptionFilter({
  value,
  onChange,
  options,
  allLabel,
  ariaLabel,
  className,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: { id: string; name: string }[];
  allLabel?: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className={cn("h-9 w-full bg-card", className)} aria-label={ariaLabel}>
        <SelectValue placeholder={allLabel ?? ariaLabel} />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const STATUS_OPTIONS = [
  { id: "active", name: "Active" },
  { id: "inactive", name: "Inactive" },
  { id: "all", name: "Active and inactive" },
];

/** "3 people" / "1 person" */
export function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}
