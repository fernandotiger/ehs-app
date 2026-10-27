"use client";

import { ArrowDown, ArrowUp, Lock, Plus, Trash2, X } from "lucide-react";
import { MultiSelect } from "@/components/common/multi-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLookups } from "@/features/shared/lookups";
import { FORM_FIELD_TYPE_LABELS, fieldHasOptions, hasPlaceholder, moduleLabel, type FormFieldDefinition, type FormFieldOption } from "@/lib/forms";

function optionValue(options: FormFieldOption[]): string {
  const taken = new Set(options.map((o) => o.value));
  let n = options.length + 1;
  while (taken.has(`option-${n}`)) n++;
  return `option-${n}`;
}

/**
 * Settings of the selected question: label, help, placeholder, required, options and – for
 * Incident – searchable / exportable / sites. Mandatory module questions keep their label and
 * stay required; their help text can change.
 */
export function FieldInspector({
  field,
  module,
  readOnly,
  conflict,
  onChange,
  onRemove,
}: {
  field: FormFieldDefinition;
  module: string;
  readOnly: boolean;
  /** Incident duplicate message for this question. */
  conflict?: string | null;
  onChange: (patch: Partial<FormFieldDefinition>) => void;
  onRemove: () => void;
}) {
  const lookups = useLookups();
  const siteOptions = (lookups.data?.sites ?? []).map((s) => ({ value: s.id, label: s.name }));
  const isHeading = field.type === "heading";
  const answerable = !isHeading && field.type !== "score";
  const options = field.options ?? [];

  function setOptions(next: FormFieldOption[]) {
    onChange({ options: next });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{FORM_FIELD_TYPE_LABELS[field.type]}</p>
        {field.system && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" /> Required by {moduleLabel(module)}
          </span>
        )}
      </div>

      <Field data-invalid={Boolean(conflict)}>
        <FieldLabel htmlFor="field-label">{isHeading ? "Heading" : "Question"} *</FieldLabel>
        <Input id="field-label" value={field.label} disabled={readOnly || field.system} onChange={(e) => onChange({ label: e.target.value })} aria-invalid={Boolean(conflict)} />
        {field.system && <FieldDescription>Required questions cannot be renamed, removed or made optional. You can move them and change their help text.</FieldDescription>}
        {conflict && <p className="text-xs font-medium text-destructive">{conflict}</p>}
      </Field>

      <Field>
        <FieldLabel htmlFor="field-help">Help text</FieldLabel>
        <Textarea id="field-help" rows={2} value={field.helpText ?? ""} disabled={readOnly} placeholder="Optional guidance shown below the question" onChange={(e) => onChange({ helpText: e.target.value || undefined })} />
      </Field>

      {hasPlaceholder(field.type) && (
        <Field>
          <FieldLabel htmlFor="field-placeholder">Placeholder</FieldLabel>
          <Input id="field-placeholder" value={field.placeholder ?? ""} disabled={readOnly} placeholder="Hint inside the empty box" onChange={(e) => onChange({ placeholder: e.target.value || undefined })} />
        </Field>
      )}

      {answerable && (
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>
            <span className="font-medium">Answer required</span>
            <span className="block text-xs text-muted-foreground">People must answer before submitting.</span>
          </span>
          <Switch checked={Boolean(field.required)} disabled={readOnly || field.system} onCheckedChange={(v) => onChange({ required: v })} />
        </label>
      )}

      {fieldHasOptions(field.type) && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Options</p>
          <ul className="space-y-1.5">
            {options.map((o, i) => (
              <li key={o.value} className="flex items-center gap-1">
                <Input
                  value={o.label}
                  aria-label={`Option ${i + 1}`}
                  disabled={readOnly || field.system}
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  className="h-8"
                />
                <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Move option up" disabled={readOnly || field.system || i === 0} onClick={() => setOptions(swap(options, i, i - 1))}>
                  <ArrowUp />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Move option down" disabled={readOnly || field.system || i === options.length - 1} onClick={() => setOptions(swap(options, i, i + 1))}>
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Remove option"
                  title={options.length <= 1 ? "Keep at least one option" : undefined}
                  disabled={readOnly || field.system || options.length <= 1}
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          {!field.system && (
            <Button type="button" variant="outline" size="sm" disabled={readOnly} onClick={() => setOptions([...options, { value: optionValue(options), label: `Option ${options.length + 1}` }])}>
              <Plus /> Add option
            </Button>
          )}
        </div>
      )}

      {module === "incidents" && answerable && (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">Incident settings</p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={Boolean(field.searchable)} disabled={readOnly} onCheckedChange={(v) => onChange({ searchable: v === true })} /> Include answers in incident search
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={field.exportable !== false} disabled={readOnly} onCheckedChange={(v) => onChange({ exportable: v === true })} /> Include in CSV export
          </label>
          {!field.system && (
            <Field>
              <FieldLabel htmlFor="field-sites">Sites where it is asked</FieldLabel>
              <MultiSelect id="field-sites" options={siteOptions} value={field.siteIds ?? []} onChange={(siteIds) => onChange({ siteIds: siteIds.length ? siteIds : undefined })} placeholder="All sites" disabled={readOnly} />
              <FieldDescription>None selected = every site. A required question is only required where it is asked.</FieldDescription>
            </Field>
          )}
        </div>
      )}

      {!field.system && !readOnly && (
        <Button type="button" variant="outline" className="w-full text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 /> Remove from this draft
        </Button>
      )}
    </div>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const next = [...list];
  [next[a], next[b]] = [next[b]!, next[a]!];
  return next;
}
