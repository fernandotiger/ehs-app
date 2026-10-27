"use client";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import { SCOPE_LABELS, SCOPE_TYPES, type ScopeTypeKey } from "@/lib/scope";

/** Structure items for one scope level, labelled with their parent (e.g. "Warehouse · Cork Distribution"). */
export function useScopeOptions(scopeType: ScopeTypeKey | undefined) {
  const lookups = useLookups();
  const options = structureOptions(lookups.data);
  switch (scopeType) {
    case "BUSINESS_UNIT":
      return options.businessUnits;
    case "SITE":
      return options.sites;
    case "LOCATION":
      return options.locations;
    case "DEPARTMENT":
      return options.departments;
    default:
      return [];
  }
}

/** Scope level + exact structure item, e.g. Site → Dublin Plant. "Whole company" needs no item. */
export function ScopePicker({
  scopeType,
  scopeId,
  onChange,
  idPrefix = "scope",
  error,
}: {
  scopeType: ScopeTypeKey;
  scopeId: string | null | undefined;
  onChange: (value: { scopeType: ScopeTypeKey; scopeId: string | null }) => void;
  idPrefix?: string;
  error?: string;
}) {
  const options = useScopeOptions(scopeType);
  const levelLabel = SCOPE_LABELS[scopeType].toLowerCase();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-type`}>Applies to *</FieldLabel>
        <Select value={scopeType} onValueChange={(v) => onChange({ scopeType: v as ScopeTypeKey, scopeId: null })}>
          <SelectTrigger id={`${idPrefix}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {SCOPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {scopeType !== "COMPANY" && (
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor={`${idPrefix}-id`}>{SCOPE_LABELS[scopeType]} *</FieldLabel>
          <Select value={scopeId ?? ""} onValueChange={(v) => onChange({ scopeType, scopeId: v })}>
            <SelectTrigger id={`${idPrefix}-id`} className="w-full" aria-invalid={Boolean(error)}>
              <SelectValue placeholder={`Choose a ${levelLabel}`} />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No active {levelLabel}s</div>}
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={error ? [{ message: error }] : []} />
        </Field>
      )}
    </div>
  );
}
