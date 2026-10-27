"use client";

import { Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INVOLVEMENT_LABELS, INVOLVEMENTS, PERSON_TYPE_LABELS, PERSON_TYPES, UNKNOWN_PERSON } from "@/lib/incidents";
import type { PersonInput } from "@/lib/validation/incidents";
import { enumOptions, LookupLabelSelect, SimpleSelect } from "../fields";

export const EMPTY_PERSON: PersonInput = { name: "", userId: null, personType: "EMPLOYEE", involvement: "WITNESS", injuryDetails: null, injuryType: null, bodyPart: null };

/** People involved: name (or Unknown), type, involvement and injury details. */
export function PeopleEditor({ value, onChange, showErrors }: { value: PersonInput[]; onChange: (people: PersonInput[]) => void; showErrors?: boolean }) {
  const set = (i: number, patch: Partial<PersonInput>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Add everyone who was hurt, involved or saw what happened.</p>}
      {value.map((person, i) => {
        const nameMissing = showErrors && !person.name.trim();
        return (
          <fieldset key={i} className="space-y-3 rounded-xl border p-3 sm:p-4">
            <legend className="flex items-center gap-2 px-1 text-sm font-medium">
              <UserRound className="size-4 text-brand" /> Person {i + 1}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={nameMissing || undefined}>
                <FieldLabel htmlFor={`person-${i}-name`}>Name *</FieldLabel>
                <div className="flex gap-2">
                  <Input id={`person-${i}-name`} value={person.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Full name" aria-invalid={nameMissing || undefined} />
                  <Button type="button" variant="outline" onClick={() => set(i, { name: UNKNOWN_PERSON, userId: null })}>
                    Unknown
                  </Button>
                </div>
                {nameMissing && <p className="text-xs font-medium text-destructive">Enter a name, or press Unknown.</p>}
              </Field>
              <Field>
                <FieldLabel htmlFor={`person-${i}-type`}>Person type</FieldLabel>
                <SimpleSelect id={`person-${i}-type`} value={person.personType} onChange={(v) => set(i, { personType: (v ?? "EMPLOYEE") as PersonInput["personType"] })} options={enumOptions(PERSON_TYPES, PERSON_TYPE_LABELS)} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`person-${i}-involvement`}>Involvement</FieldLabel>
                <SimpleSelect id={`person-${i}-involvement`} value={person.involvement} onChange={(v) => set(i, { involvement: (v ?? "WITNESS") as PersonInput["involvement"] })} options={enumOptions(INVOLVEMENTS, INVOLVEMENT_LABELS)} />
              </Field>
              {person.involvement === "INJURED" && (
                <>
                  <Field>
                    <FieldLabel htmlFor={`person-${i}-injury-type`}>Injury type (optional)</FieldLabel>
                    <LookupLabelSelect id={`person-${i}-injury-type`} listKey="incident.injury-type" value={person.injuryType} onChange={(v) => set(i, { injuryType: v })} allowNone noneLabel="Not specified" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`person-${i}-body`}>Body part (optional)</FieldLabel>
                    <LookupLabelSelect id={`person-${i}-body`} listKey="incident.body-part" value={person.bodyPart} onChange={(v) => set(i, { bodyPart: v })} allowNone noneLabel="Not specified" />
                  </Field>
                </>
              )}
            </div>
            <Field>
              <FieldLabel htmlFor={`person-${i}-injury`}>Injury details</FieldLabel>
              <Textarea id={`person-${i}-injury`} rows={2} value={person.injuryDetails ?? ""} onChange={(e) => set(i, { injuryDetails: e.target.value || null })} placeholder={person.involvement === "INJURED" ? "What injury, and how serious?" : "None"} />
            </Field>
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Trash2 /> Remove person
              </Button>
            </div>
          </fieldset>
        );
      })}
      <Button type="button" variant="outline" onClick={() => onChange([...value, { ...EMPTY_PERSON }])}>
        <Plus /> Add a person
      </Button>
    </div>
  );
}
