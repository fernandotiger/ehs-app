"use client";

import { Controller, type Control } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { UpdateDocumentInput } from "@/lib/validation/documents";
import { CategoryCombobox } from "./category-combobox";
import { TagPicker } from "./tag-picker";

/** An array field reports either one error (too many tags) or one per item (a tag too long). */
function tagErrors(error: unknown): ({ message?: string } | undefined)[] {
  if (!error) return [];
  return Array.isArray(error) ? error.filter(Boolean).slice(0, 1) : [error as { message?: string }];
}

/** Title, reference code, category, tags and description. */
export function DocumentDetailsFields({ control, disabled }: { control: Control<UpdateDocumentInput>; disabled?: boolean }) {
  return (
    <FieldGroup className="gap-4">
      <Controller
        name="title"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="doc-title">Title</FieldLabel>
            <Input id="doc-title" placeholder="e.g. Annual Leave Policy 2026" disabled={disabled} {...field} aria-invalid={fieldState.invalid} />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          name="referenceCode"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="doc-ref">Reference code</FieldLabel>
              <Input id="doc-ref" placeholder="Optional, e.g. HR-POL-001" disabled={disabled} {...field} aria-invalid={fieldState.invalid} />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="categoryName"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="doc-category">Category</FieldLabel>
              <CategoryCombobox id="doc-category" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </div>
      <Controller
        name="tags"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="doc-tags">Tags</FieldLabel>
            <TagPicker id="doc-tags" value={field.value} onChange={field.onChange} invalid={fieldState.invalid} disabled={disabled} />
            <FieldDescription>Optional words that group documents and help people find them, e.g. &ldquo;Fire safety&rdquo; or &ldquo;Induction&rdquo;.</FieldDescription>
            <FieldError errors={tagErrors(fieldState.error)} />
          </Field>
        )}
      />
      <Controller
        name="description"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="doc-description">Description</FieldLabel>
            <Textarea id="doc-description" rows={3} placeholder="What is this document about?" disabled={disabled} {...field} aria-invalid={fieldState.invalid} />
            <FieldDescription>Shown to employees under the title.</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </FieldGroup>
  );
}
