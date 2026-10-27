"use client";

import { Controller, type Control } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { UpdateDocumentInput } from "@/lib/validation/documents";
import { CategoryCombobox } from "./category-combobox";

/** Title, reference code, category and description. */
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
