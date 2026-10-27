"use client";

import { Users } from "lucide-react";
import { useDeferredValue } from "react";
import { Controller, useFormState, useWatch, type Control } from "react-hook-form";
import { MultiSelect } from "@/components/common/multi-select";
import { UserMultiPicker } from "@/components/common/user-picker";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { structureOptions, useLookups } from "@/features/shared/lookups";
import { audienceSize, EMPTY_AUDIENCE, type UpdateDocumentInput } from "@/lib/validation/documents";
import { useAudienceEstimate } from "../../api";

function AudienceEstimate({ control }: { control: Control<UpdateDocumentInput> }) {
  const audience = useWatch({ control, name: "audience" }) ?? EMPTY_AUDIENCE;
  const { errors } = useFormState({ control, name: "audience" });
  const deferred = useDeferredValue(audience);
  const estimate = useAudienceEstimate(deferred);
  const empty = !audience.allEmployees && audienceSize({ ...EMPTY_AUDIENCE, ...audience }) === 0;
  const showError = empty && Boolean(errors.audience);

  return (
    <div
      role={showError ? "alert" : undefined}
      className={cn("flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm", showError ? "bg-destructive/10 text-destructive" : "bg-brand-soft text-brand")}
    >
      <Users className="size-4 shrink-0" />
      {empty ? (
        <span>Choose at least one audience.</span>
      ) : estimate.data ? (
        <span>
          <span className="font-semibold tabular-nums">≈ {estimate.data.count.toLocaleString()}</span> {estimate.data.count === 1 ? "person" : "people"} will have access
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Spinner className="size-3.5" /> Counting people…
        </span>
      )}
      {estimate.isFetching && estimate.data && <Spinner className="ml-auto size-3.5" />}
    </div>
  );
}

type StructureField = "audience.roleIds" | "audience.businessUnitIds" | "audience.siteIds" | "audience.locationIds" | "audience.departmentIds";

/**
 * Multiple audiences can be combined: anyone matching ANY of them gets access
 * (all employees, roles, business units, sites, locations, departments, named people).
 * Structure audiences match people by their home placement.
 */
export function AudienceBuilder({ control }: { control: Control<UpdateDocumentInput> }) {
  const lookups = useLookups();
  const structure = structureOptions(lookups.data);
  const toOptions = (items: { id: string; name: string }[] | undefined) => (items ?? []).map((i) => ({ value: i.id, label: i.name }));
  const allEmployees = useWatch({ control, name: "audience.allEmployees" });

  const fields: { name: StructureField; id: string; label: string; placeholder: string; options: { value: string; label: string }[] }[] = [
    { name: "audience.roleIds", id: "aud-roles", label: "Roles", placeholder: "e.g. Manager", options: toOptions(lookups.data?.roles) },
    { name: "audience.businessUnitIds", id: "aud-business-units", label: "Business units", placeholder: "Any business unit", options: toOptions(structure.businessUnits) },
    { name: "audience.siteIds", id: "aud-sites", label: "Sites", placeholder: "Any site", options: toOptions(structure.sites) },
    { name: "audience.locationIds", id: "aud-locations", label: "Locations", placeholder: "Any location", options: toOptions(structure.locations) },
    { name: "audience.departmentIds", id: "aud-departments", label: "Departments", placeholder: "Any department", options: toOptions(structure.departments) },
  ];

  return (
    <FieldGroup className="gap-4">
      <Controller
        name="audience.allEmployees"
        control={control}
        render={({ field }) => (
          <Field orientation="horizontal" className="rounded-xl border p-3">
            <FieldContent>
              <FieldLabel htmlFor="aud-all">All employees</FieldLabel>
              <FieldDescription>Everyone with an active account.</FieldDescription>
            </FieldContent>
            <Switch id="aud-all" checked={field.value} onCheckedChange={field.onChange} />
          </Field>
        )}
      />

      <div className={allEmployees ? "pointer-events-none space-y-4 opacity-50" : "space-y-4"} aria-disabled={allEmployees}>
        {allEmployees && <p className="text-xs text-muted-foreground">Everyone is already included – narrower audiences are ignored while this is on.</p>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {fields.map((f) => (
            <Controller
              key={f.name}
              name={f.name}
              control={control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={f.id}>{f.label}</FieldLabel>
                  <MultiSelect id={f.id} options={f.options} value={field.value ?? []} onChange={field.onChange} placeholder={f.placeholder} disabled={allEmployees} />
                </Field>
              )}
            />
          ))}
        </div>
        <Controller
          name="audience.userIds"
          control={control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="aud-users">Named employees</FieldLabel>
              <UserMultiPicker id="aud-users" value={field.value} onChange={field.onChange} placeholder="Add specific people…" disabled={allEmployees} />
            </Field>
          )}
        />
      </div>

      <AudienceEstimate control={control} />
    </FieldGroup>
  );
}
