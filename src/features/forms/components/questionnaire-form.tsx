"use client";

import { Calculator, Paperclip, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { UserPicker } from "@/components/common/user-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useSystemSettings } from "@/features/shared/settings";
import { errorMessage } from "@/lib/api-client";
import { fieldsForSite, visibleFields, type FileAnswer, type FormFieldDefinition, type FormValues } from "@/lib/forms";
import type { QuestionnaireSnapshot } from "@/lib/forms/questionnaire";
import { formatBytes, uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

/**
 * Renders a captured questionnaire (or a form preview) with the shared form engine.
 *
 *   <QuestionnaireForm snapshot={snapshot} value={answers} onChange={setAnswers} errors={errors} />
 *
 * Person questions use the directory picker; file questions upload through the evidence flow
 * (`uploadFile(file, "evidence")`) and store `{ uploadId, fileName }` – the module consumes the
 * upload ids as evidence when it saves the record. `readOnly` disables every input (Form Builder
 * preview: answers are not accepted).
 */
export function QuestionnaireForm({
  snapshot,
  value,
  onChange,
  errors,
  readOnly = false,
  idPrefix = "q",
}: {
  snapshot: Pick<QuestionnaireSnapshot, "fields" | "siteId">;
  value: FormValues;
  onChange?: (next: FormValues) => void;
  errors?: Record<string, string>;
  readOnly?: boolean;
  idPrefix?: string;
}) {
  const fields = visibleFields(fieldsForSite(snapshot.fields, snapshot.siteId), value);
  const set = (key: string, answer: unknown) => onChange?.({ ...value, [key]: answer });

  if (!fields.length) return <p className="text-sm text-muted-foreground">This form has no questions.</p>;

  return (
    <div className="space-y-5">
      {fields.map((field) => (
        <QuestionField
          key={field.key}
          id={`${idPrefix}-${field.key}`}
          field={field}
          value={value[field.key]}
          onChange={(answer) => set(field.key, answer)}
          error={errors?.[field.key]}
          disabled={readOnly}
        />
      ))}
    </div>
  );
}

function QuestionLabel({ field, htmlFor }: { field: FormFieldDefinition; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium leading-snug">
      {field.label}
      {field.required && field.type !== "score" ? <span className="text-destructive"> *</span> : null}
    </label>
  );
}

export function QuestionField({
  id,
  field,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
}) {
  if (field.type === "heading") {
    return (
      <div className="border-b pb-1 pt-2">
        <h3 className="text-base font-semibold">{field.label}</h3>
        {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
      </div>
    );
  }
  const invalid = Boolean(error);
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  let control: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control = <Textarea id={id} rows={4} value={text} placeholder={field.placeholder} disabled={disabled} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "number":
      control = (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={text}
          placeholder={field.placeholder}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
      break;
    case "date":
    case "datetime":
    case "time":
      control = (
        <Input
          id={id}
          type={field.type === "date" ? "date" : field.type === "time" ? "time" : "datetime-local"}
          value={text}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          className="w-full sm:w-64"
        />
      );
      break;
    case "select":
      control = (
        <Select value={text} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={id} className="w-full sm:w-80" aria-invalid={invalid}>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "radio":
      control = (
        <RadioGroup id={id} value={text} onValueChange={onChange} disabled={disabled} className="gap-2">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={o.value} /> {o.label}
            </label>
          ))}
        </RadioGroup>
      );
      break;
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <div id={id} className="grid gap-2 sm:grid-cols-2">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(o.value)}
                disabled={disabled}
                onCheckedChange={(checked) => onChange(checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "boolean":
      control = (
        <RadioGroup
          id={id}
          value={value === true ? "true" : value === false ? "false" : ""}
          onValueChange={(v) => onChange(v === "true")}
          disabled={disabled}
          className="flex gap-6"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="true" /> Yes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="false" /> No
          </label>
        </RadioGroup>
      );
      break;
    case "checkbox":
      control = (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox id={id} checked={value === true} disabled={disabled} onCheckedChange={(c) => onChange(c === true)} /> Yes
        </label>
      );
      break;
    case "person":
      control = <UserPicker id={id} value={typeof value === "string" ? value : null} onChange={(uid) => onChange(uid ?? undefined)} disabled={disabled} />;
      break;
    case "file":
      control = <FileAnswerInput id={id} value={Array.isArray(value) ? (value as FileAnswer[]) : []} onChange={onChange} disabled={disabled} max={field.max ?? 10} />;
      break;
    case "score":
      control = (
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Calculator className="size-4" /> Calculated automatically
        </div>
      );
      break;
    default:
      control = <Input id={id} value={text} placeholder={field.placeholder} disabled={disabled} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <div className="space-y-1.5" data-invalid={invalid || undefined}>
      <QuestionLabel field={field} htmlFor={["select", "person", "date", "datetime", "time", "number", "text", "textarea"].includes(field.type) ? id : undefined} />
      {control}
      {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

/** Files for a `file` question: uploaded now (evidence purpose), attached to the record when it is saved. */
function FileAnswerInput({ id, value, onChange, disabled, max }: { id: string; value: FileAnswer[]; onChange: (v: FileAnswer[]) => void; disabled?: boolean; max: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const { data: settings } = useSystemSettings();
  const maxBytes = (settings?.evidenceMaxUploadMb ?? 2) * 1024 * 1024;

  async function add(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > maxBytes) {
      toast.error(`${file.name} is larger than the ${formatBytes(maxBytes)} limit.`);
      return;
    }
    setUploading(file.name);
    try {
      const result = await uploadFile(file, "evidence");
      onChange([...value, { uploadId: result.uploadId, fileName: result.fileName, sizeBytes: result.sizeBytes }]);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div id={id} className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((f, i) => (
            <li key={`${f.uploadId ?? f.attachmentId}-${i}`} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
              {f.sizeBytes !== undefined && <span className="text-xs text-muted-foreground">{formatBytes(f.sizeBytes)}</span>}
              {!disabled && (
                <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Remove ${f.fileName}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" className="hidden" onChange={(e) => void add(e.target.files)} tabIndex={-1} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || Boolean(uploading) || value.length >= max}
        onClick={() => input.current?.click()}
        className={cn(disabled && "pointer-events-none")}
      >
        {uploading ? <Spinner /> : <Plus />} {uploading ? `Uploading ${uploading}…` : "Attach a file"}
      </Button>
    </div>
  );
}
