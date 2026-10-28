"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, ClipboardList, Clock, FileUp, ListChecks, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm, type Control, type FieldValues, type Path } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { ErrorState, LoadingCards } from "@/components/common/states";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { documentSurveySettingsSchema, type DocumentSurveySettings } from "@/lib/settings/document-survey";
import { systemSettingsSchema, type SystemSettings } from "@/lib/settings/system";
import { LOCALES } from "@/lib/validation/configuration";
import { useCompanySettings, useSaveCompanySettings, useSaveVersionedSetting, useVersionedSetting, type CompanySettings } from "../api";

type FormValues = z.input<typeof systemSettingsSchema>;
type SurveyFormValues = z.input<typeof documentSurveySettingsSchema>;

function timeZones(current: string): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const list = intl.supportedValuesOf?.("timeZone") ?? ["Europe/Dublin", "Europe/London", "UTC"];
  return list.includes(current) ? list : [current, ...list];
}

/** /configuration/settings – company time zone & locale (Organization) plus the "system" setting. */
export function SystemSettingsForm() {
  const system = useVersionedSetting("system");
  const survey = useVersionedSetting("documentSurvey");
  const company = useCompanySettings();
  if (system.isError || company.isError || survey.isError) {
    return (
      <ErrorState
        error={system.error ?? company.error ?? survey.error}
        onRetry={() => {
          void system.refetch();
          void survey.refetch();
          void company.refetch();
        }}
      />
    );
  }
  if (system.isPending || company.isPending || survey.isPending) {
    return (
      <>
        <SettingsHeader />
        <LoadingCards count={4} className="lg:grid-cols-2" />
      </>
    );
  }
  return (
    <SettingsForm
      key={`${system.data.version}:${company.data.version}:${survey.data.version}`}
      saved={system.data.value}
      version={system.data.version}
      survey={survey.data}
      company={company.data}
      onReload={() => {
        void system.refetch();
        void survey.refetch();
        void company.refetch();
      }}
    />
  );
}

function SettingsHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <PageHeader
      title="System settings"
      description="Company-wide configuration. Changes apply immediately and are recorded in the audit log."
      backHref="/configuration"
      backLabel="Configuration"
      actions={actions}
    />
  );
}

function SettingsForm({
  saved,
  version,
  survey,
  company,
  onReload,
}: {
  saved: SystemSettings;
  version: number;
  survey: { value: DocumentSurveySettings; version: number };
  company: CompanySettings;
  onReload: () => void;
}) {
  const saveSystem = useSaveVersionedSetting("system");
  const saveSurvey = useSaveVersionedSetting("documentSurvey");
  const saveCompany = useSaveCompanySettings();
  const form = useForm<FormValues, unknown, SystemSettings>({ resolver: zodResolver(systemSettingsSchema), defaultValues: saved });
  const surveyForm = useForm<SurveyFormValues, unknown, DocumentSurveySettings>({ resolver: zodResolver(documentSurveySettingsSchema), defaultValues: survey.value });
  const [timeZone, setTimeZone] = useState(company.timeZone);
  const [locale, setLocale] = useState(company.locale);
  const [stale, setStale] = useState(false);
  const companyDirty = timeZone !== company.timeZone || locale !== company.locale;
  const dirty = form.formState.isDirty || surveyForm.formState.isDirty || companyDirty;
  const guard = useUnsavedChangesGuard(dirty);
  const zones = useMemo(() => timeZones(company.timeZone), [company.timeZone]);
  const pending = saveSystem.isPending || saveCompany.isPending || saveSurvey.isPending;

  async function onSubmit(values: SystemSettings) {
    const surveyDirty = surveyForm.formState.isDirty;
    if (surveyDirty && !(await surveyForm.trigger())) {
      toast.error("Please check the highlighted fields.");
      return;
    }
    try {
      if (form.formState.isDirty) await saveSystem.mutateAsync({ value: values, expectedVersion: version });
      if (surveyDirty) await saveSurvey.mutateAsync({ value: documentSurveySettingsSchema.parse(surveyForm.getValues()), expectedVersion: survey.version });
      if (companyDirty) await saveCompany.mutateAsync({ timeZone, locale, expectedVersion: company.version });
      toast.success("Settings saved");
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
    }
  }

  function discard() {
    form.reset(saved);
    surveyForm.reset(survey.value);
    setTimeZone(company.timeZone);
    setLocale(company.locale);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      {guard.dialog}
      <SettingsHeader
        actions={
          <>
            <Button type="button" variant="outline" disabled={!dirty || pending} onClick={discard}>
              <RotateCcw /> Discard
            </Button>
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? <Spinner /> : <Save />} Save changes
            </Button>
          </>
        }
      />
      {stale && (
        <StaleVersionAlert className="mb-4" draft={{ system: form.getValues(), documentSurvey: surveyForm.getValues(), timeZone, locale }} draftName="system-settings" onReload={onReload} />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-brand" /> Company time zone and language
            </CardTitle>
            <CardDescription>Used for due dates, reminders and how dates and numbers are shown.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="time-zone">Time zone</FieldLabel>
                <Select value={timeZone} onValueChange={setTimeZone}>
                  <SelectTrigger id="time-zone" className="w-full max-w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {zones.map((z) => (
                      <SelectItem key={z} value={z}>
                        {z.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Reminders and &quot;due today&quot; are worked out in this time zone.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="locale">Locale</FieldLabel>
                <Select value={locale} onValueChange={setLocale}>
                  <SelectTrigger id="locale" className="w-full max-w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALES.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Date and number format for exports and messages.</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileUp className="size-4 text-brand" /> Files
            </CardTitle>
            <CardDescription>Size limits for uploaded files.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <NumberField control={form.control} name="maxUploadSizeMb" label="Document upload limit" unit="MB" description="Document versions – all file types are accepted up to this size." />
              <NumberField control={form.control} name="evidenceMaxUploadMb" label="Evidence upload limit" unit="MB" description="Files attached as evidence to incidents, audits, inspections and other records." />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="size-4 text-brand" /> Document acknowledgements
            </CardTitle>
            <CardDescription>Defaults for new documents that require acknowledgement (can be overridden per document).</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <NumberField control={form.control} name="defaultAckDueDays" label="Acknowledge within" unit="days" description="Time an employee has after a document is assigned." />
              <NumberField control={form.control} name="defaultReminderIntervalDays" label="Remind every" unit="days" description="Automatic in-app reminders while outstanding." />
              <NumberField control={form.control} name="defaultEscalationDays" label="Escalate after" unit="days overdue" description="Escalate to the employee's manager or HR." />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="size-4 text-brand" /> Actions
            </CardTitle>
            <CardDescription>Reminders for corrective and preventive actions.</CardDescription>
          </CardHeader>
          <CardContent>
            <NumberField control={form.control} name="actionReminderDaysBeforeDue" label="Remind owners" unit="days before due" description="Overdue actions are always flagged to the owner and investigator." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="size-4 text-brand" /> Employee inductions
            </CardTitle>
            <CardDescription>Inductions created under Documents → Create induction.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <NumberField
                control={surveyForm.control}
                name="defaultDueDays"
                label="Complete within"
                unit="days"
                description="Default deadline when everyone must complete an induction (can be changed per induction)."
              />
              <NumberField
                control={surveyForm.control}
                name="anonymityThreshold"
                label="Show anonymous answers from"
                unit="answers"
                description="Anonymous answers stay hidden in results and exports until at least this many exist (1–10), so nobody in a small team can be recognised."
              />
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function NumberField<TValues extends FieldValues, TOut extends FieldValues>({
  control,
  name,
  label,
  unit,
  description,
}: {
  control: Control<TValues, unknown, TOut>;
  name: Path<TValues>;
  label: string;
  unit: string;
  description?: string;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <InputGroup className="max-w-60">
            <InputGroupInput
              id={name}
              type="number"
              inputMode="numeric"
              min={0}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={String(field.value ?? "")}
              onChange={(e) => field.onChange(e.target.value)}
              aria-invalid={fieldState.invalid}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>{unit}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}
