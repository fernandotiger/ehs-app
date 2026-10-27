"use client";

import { Controller, useWatch, type Control, type FieldPath } from "react-hook-form";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ESCALATION_TARGETS, type EscalationTargetValue, type UpdateDocumentInput } from "@/lib/validation/documents";
import { ESCALATION_TARGET_LABELS } from "../../format";

type DayField = Extract<FieldPath<UpdateDocumentInput>, "ack.ackDueDays" | "ack.reminderIntervalDays" | "ack.escalationDays">;

function DaysInput({ control, name, label, description }: { control: Control<UpdateDocumentInput>; name: DayField; label: string; description: string }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <div className="relative">
            <Input
              id={name}
              type="number"
              inputMode="numeric"
              min={0}
              className="h-9 pr-12"
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={Number.isFinite(field.value) ? field.value : ""}
              onChange={(e) => field.onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
              aria-invalid={fieldState.invalid}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">days</span>
          </div>
          <FieldDescription>{description}</FieldDescription>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

/**
 * Acknowledgement Required switch plus due / reminder / escalation settings. `unavailableReason`
 * (e.g. a survey without a file) disables the switch and explains why.
 */
export function AckSettingsFields({ control, unavailableReason }: { control: Control<UpdateDocumentInput>; unavailableReason?: string }) {
  const required = useWatch({ control, name: "ack.requiresAcknowledgement" });

  return (
    <FieldGroup className="gap-4">
      <Controller
        name="ack.requiresAcknowledgement"
        control={control}
        render={({ field }) => (
          <Field orientation="horizontal" className="rounded-xl border p-3">
            <FieldContent>
              <FieldLabel htmlFor="ack-required">Acknowledgement required</FieldLabel>
              <FieldDescription>{unavailableReason ?? "Employees must open the document and confirm they have read and understood it."}</FieldDescription>
            </FieldContent>
            <Switch id="ack-required" checked={field.value} onCheckedChange={field.onChange} disabled={Boolean(unavailableReason) && !field.value} />
          </Field>
        )}
      />
      {required && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DaysInput control={control} name="ack.ackDueDays" label="Due within" description="From publication (or joining)." />
          <DaysInput control={control} name="ack.reminderIntervalDays" label="Remind every" description="While still outstanding." />
          <DaysInput control={control} name="ack.escalationDays" label="Escalate after" description="Days overdue." />
          <Controller
            name="ack.escalationTarget"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="ack-escalation">Escalate to</FieldLabel>
                <Select value={field.value} onValueChange={(v) => field.onChange(v as EscalationTargetValue)}>
                  <SelectTrigger id="ack-escalation" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESCALATION_TARGETS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ESCALATION_TARGET_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>In-app notification.</FieldDescription>
              </Field>
            )}
          />
        </div>
      )}
    </FieldGroup>
  );
}
