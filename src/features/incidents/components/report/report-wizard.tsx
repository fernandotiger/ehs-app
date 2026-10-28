"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bandage,
  Check,
  CircleQuestionMark,
  ClipboardCheck,
  CloudOff,
  Droplets,
  EyeOff,
  Flame,
  Lightbulb,
  MessageSquareWarning,
  Paperclip,
  Plus,
  Save,
  Send,
  ShieldAlert,
  Stethoscope,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { EmptyState, LoadingCards } from "@/components/common/states";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UserMultiPicker } from "@/components/common/user-picker";
import { QuestionnaireForm } from "@/features/forms/components/questionnaire-form";
import { useSystemSettings } from "@/features/shared/settings";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ApiError, errorMessage } from "@/lib/api-client";
import { fieldsForSite, repeatedDefaultKeys, validateQuestionnaireAnswers, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import { SEVERITIES, SEVERITY_LABELS, type Severity } from "@/lib/incidents";
import { enqueue, stageFile } from "@/lib/offline/outbox";
import { PERMISSIONS } from "@/lib/permissions";
import { formatBytes, uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import type { PersonInput } from "@/lib/validation/incidents";
import { submitBlockers } from "@/server/modules/incidents/workflow";
import { useCreateIncident, useIncidentCommand, useReportSetup, useUpdateIncident, type IncidentDetailDto, type ReportSetupTypeDto } from "../../api";
import { addDaysLocal, blockersOf, fromLocalInput, toLocalInput, todayLocal } from "../../format";
import { DepartmentSelect, LookupLabelSelect, SimpleSelect, useDepartmentName, useDepartmentSite } from "../fields";
import { BlockerList } from "../shared";
import { EMPTY_PERSON, PeopleEditor } from "./people-editor";
import { applyTypeChoice } from "./type-choice";

const STEPS = ["Type of event", "What & where", "People & first aid", "Review & submit"] as const;
const STEP = { TYPE: 0, WHAT: 1, PEOPLE: 2, REVIEW: 3 } as const;

/** Card icons for the built-in types (by stable key); types an administrator adds get the fallback. */
const TYPE_ICONS: Record<string, LucideIcon> = {
  accident: Bandage,
  complaint: MessageSquareWarning,
  "dangerous-occurrence": Flame,
  "inspection-finding": ClipboardCheck,
  incident: Droplets,
  "near-miss": TriangleAlert,
  "occupational-health": Stethoscope,
  "safety-comment": Lightbulb,
  other: CircleQuestionMark,
};
const SYSTEM_KEYS = ["incidentTitle", "occurredAt", "site", "whatHappened"];

interface ReportValues {
  typeId: string;
  subtypeId: string | null;
  severity: Severity;
  title: string;
  occurredAt: string;
  departmentId: string | null;
  preciseLocation: string;
  shift: string | null;
  narrative: string;
  investigationTargetDate: string;
  targetTouched: boolean;
  people: PersonInput[];
  immediateAction: string;
  firstAid: string;
  nurseNotified: boolean;
  investigatorIds: string[];
  notifyUserIds: string[];
  isConfidential: boolean;
  /** Report anonymously – fixed once the report is first saved. */
  anonymous: boolean;
  answers: FormValues;
}

function initialValues(types: ReportSetupTypeDto[], incident?: IncidentDetailDto): ReportValues {
  if (incident) {
    return {
      typeId: incident.type.id,
      subtypeId: incident.subtype?.id ?? null,
      severity: incident.severity,
      title: incident.title,
      occurredAt: toLocalInput(incident.occurredAt),
      departmentId: incident.placement.departmentId,
      preciseLocation: incident.preciseLocation ?? "",
      shift: incident.shift,
      narrative: incident.narrative ?? "",
      investigationTargetDate: incident.investigationTargetDate ?? "",
      targetTouched: true,
      people: incident.people.map((p) => ({ name: p.name, userId: p.userId, personType: p.personType, involvement: p.involvement, injuryDetails: p.injuryDetails, injuryType: p.injuryType, bodyPart: p.bodyPart })),
      immediateAction: incident.immediateAction ?? "",
      firstAid: incident.firstAid ?? "",
      nurseNotified: incident.nurseNotified,
      investigatorIds: incident.investigators.map((i) => i.id),
      notifyUserIds: incident.notifyUsers.map((u) => u.id),
      isConfidential: incident.isConfidential,
      anonymous: incident.isAnonymous,
      answers: Object.fromEntries(Object.entries(incident.answers).filter(([k]) => !SYSTEM_KEYS.includes(k))),
    };
  }
  const first = types[0];
  const now = toLocalInput(new Date().toISOString());
  return {
    typeId: "",
    subtypeId: null,
    severity: "MINOR",
    title: "",
    occurredAt: now,
    departmentId: null,
    preciseLocation: "",
    shift: null,
    narrative: "",
    investigationTargetDate: addDaysLocal(todayLocal(), first?.targetDays ?? 7),
    targetTouched: false,
    people: [{ ...EMPTY_PERSON }],
    immediateAction: "",
    firstAid: "",
    nurseNotified: false,
    investigatorIds: [],
    notifyUserIds: [],
    isConfidential: false,
    anonymous: false,
    answers: {},
  };
}

/**
 * Report an incident in four steps – type of event, what & where, people, review – or edit an
 * existing report (opens on "What & where"). Draft can be saved at any time (type + title only).
 * Offline, the report is queued on the device and sent on Sync (same clientId).
 */
export function ReportWizard({ incident }: { incident?: IncidentDetailDto }) {
  const setup = useReportSetup();
  // The setup can already be restored from the device cache while this page hydrates; render the
  // same placeholder as the server first, otherwise React reports a hydration mismatch.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!hydrated || setup.isPending) return <LoadingCards count={4} />;
  const types = setup.data ?? [];
  if (!types.length) {
    return (
      <EmptyState
        icon={CloudOff}
        title="Incident reporting is not available"
        description={setup.isError ? "Open this page once while online so it also works offline." : "No active incident types with a published report form – ask your administrator."}
      />
    );
  }
  return <Wizard types={types} incident={incident} />;
}

function Wizard({ types, incident }: { types: ReportSetupTypeDto[]; incident?: IncidentDetailDto }) {
  const router = useRouter();
  const { user, can } = useCurrentUser();
  const online = useOnlineStatus();
  const { data: system } = useSystemSettings();
  const create = useCreateIncident();
  const update = useUpdateIncident(incident?.id ?? "");
  const command = useIncidentCommand(incident?.id ?? "");
  const [initial] = useState(() => initialValues(types, incident));
  const [values, setValues] = useState<ReportValues>(initial);
  const [step, setStep] = useState<number>(incident ? STEP.WHAT : STEP.TYPE);
  // Subtype last chosen per type, so switching type and back keeps it.
  const subtypeMemory = useRef(new Map<string, string | null>());
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverBlockers, setServerBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [clientId] = useState(() => crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial) || files.length > 0;
  const guard = useUnsavedChangesGuard(dirty && !busy);

  // In edit mode the incident's own type may be inactive now – keep it selectable.
  const type = types.find((t) => t.id === values.typeId) ?? (incident ? undefined : undefined);
  const editType = incident && !type ? incident.type : null;
  const siteId = useDepartmentSite(values.departmentId);
  const departmentName = useDepartmentName(values.departmentId);
  const multiple = type?.multipleInvestigators ?? editType?.multipleInvestigators ?? true;
  const assignmentRequired = type?.assignmentRequired ?? editType?.assignmentRequired ?? false;
  const attachmentsAllowed = type?.attachmentsAllowed ?? true;
  const isDraft = !incident || incident.isDraft;

  // Questionnaire: the captured form when editing, otherwise the type's latest published Report form for this site.
  const snapshot: Pick<QuestionnaireSnapshot, "fields" | "siteId"> | null = useMemo(() => {
    if (incident?.reportForm) return { fields: incident.reportForm.fields, siteId: incident.reportForm.siteId };
    if (!type?.reportFormVersion) return null;
    return { fields: fieldsForSite(type.reportFormVersion.fields, siteId), siteId };
  }, [incident, type, siteId]);
  const customSnapshot = useMemo(() => {
    if (!snapshot) return null;
    const hidden = new Set([...SYSTEM_KEYS, ...repeatedDefaultKeys(snapshot.fields, "REPORT")]);
    return { ...snapshot, fields: snapshot.fields.filter((f) => !hidden.has(f.key)) };
  }, [snapshot]);

  const set = (patch: Partial<ReportValues>) => setValues((v) => ({ ...v, ...patch }));

  /** Picking a card moves straight on to "What & where"; nothing already entered is lost. */
  function chooseType(id: string) {
    const t = types.find((x) => x.id === id);
    if (!t) return;
    if (values.typeId && values.typeId !== id) subtypeMemory.current.set(values.typeId, values.subtypeId);
    setValues((v) => applyTypeChoice(v, t, { editing: Boolean(incident), rememberedSubtypeId: subtypeMemory.current.get(id) }));
    goTo(STEP.WHAT);
  }

  // Client-side guidance with the same rules the server applies.
  const answerCheck = useMemo(() => {
    if (!customSnapshot) return { missing: [] as string[], errors: {} as Record<string, string> };
    const result = validateQuestionnaireAnswers(customSnapshot, values.answers, { mode: "submit" });
    const missing = Object.entries(result.errors).map(([key, message]) => {
      const field = customSnapshot.fields.find((f) => f.key === key);
      return field && /is required$/.test(message) ? field.label : message;
    });
    return { missing, errors: result.errors };
  }, [customSnapshot, values.answers]);

  const gates = submitBlockers({
    title: values.title,
    occurredAt: fromLocalInput(values.occurredAt),
    departmentId: values.departmentId,
    investigationTargetDate: values.investigationTargetDate || null,
    typeActive: Boolean(type) || Boolean(editType),
    typeHasSubtypes: Boolean(type?.subtypes.some((s) => s.isActive)),
    subtypeId: values.subtypeId,
    subtypeValid: true,
    people: values.people,
    investigatorCount: values.investigatorIds.length,
    assignmentRequired,
    multipleInvestigators: multiple,
    missingAnswers: [...(values.narrative.trim() ? [] : ["What happened?"]), ...answerCheck.missing],
  });

  const goTo = (next: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function payload() {
    return {
      typeId: values.typeId,
      subtypeId: values.subtypeId,
      title: values.title.trim(),
      narrative: values.narrative.trim() || null,
      occurredAt: fromLocalInput(values.occurredAt),
      severity: values.severity,
      departmentId: values.departmentId,
      preciseLocation: values.preciseLocation.trim() || null,
      shift: values.shift,
      investigationTargetDate: values.investigationTargetDate || null,
      isConfidential: values.isConfidential,
      investigatorIds: values.investigatorIds,
      notifyUserIds: values.notifyUserIds,
      people: values.people,
      immediateAction: values.immediateAction.trim() || null,
      firstAid: values.firstAid.trim() || null,
      nurseNotified: values.nurseNotified,
      answers: values.answers,
    };
  }

  async function saveOffline(submit: boolean) {
    const placeholders = await Promise.all(files.map((f) => stageFile(f)));
    await enqueue({
      id: clientId,
      type: "incident.report",
      payload: { ...payload(), anonymous: values.anonymous, clientId, submit, evidenceUploadIds: placeholders },
      label: `Incident: ${values.title.trim() || "Untitled"}`,
      userId: user.id,
      fileIds: placeholders.map((p) => p.$file),
    });
    toast.success("Saved on this device", { description: "It will be sent when you press Sync while online." });
    router.push("/incidents/register");
  }

  async function send(submit: boolean) {
    setServerBlockers([]);
    if (!values.typeId) {
      setShowErrors(true);
      toast.error("Choose the type of event first.");
      goTo(STEP.TYPE);
      return;
    }
    if (!values.title.trim()) {
      setShowErrors(true);
      toast.error("Enter an incident title – with the type, it is all a draft needs.");
      goTo(STEP.WHAT);
      return;
    }
    if (submit && gates.length) {
      setShowErrors(true);
      toast.error("Some required information is missing.");
      goTo(STEP.REVIEW);
      return;
    }
    setBusy(submit ? "submit" : "draft");
    try {
      if (incident) {
        await update.mutateAsync({ ...payload(), expectedVersion: incident.version });
        if (submit && incident.isDraft) await command.mutateAsync({ command: "submit", expectedVersion: incident.version + 1 });
        toast.success(submit && incident.isDraft ? `${incident.reference} submitted` : "Changes saved");
        router.push(`/incidents/${incident.id}`);
        return;
      }
      if (online) {
        try {
          const uploadIds: string[] = [];
          for (const file of files) uploadIds.push((await uploadFile(file, "evidence")).uploadId);
          const result = await create.mutateAsync({
            ...payload(),
            anonymous: values.anonymous,
            clientId,
            submit,
            formVersionId: type?.reportFormVersion?.versionId ?? null,
            evidenceUploadIds: uploadIds,
          });
          toast.success(submit ? `Incident ${result.reference} reported` : `Draft ${result.reference} saved`);
          router.push(`/incidents/${result.id}`);
          return;
        } catch (error) {
          if (!(error instanceof ApiError && error.isNetworkError)) throw error;
        }
      }
      await saveOffline(submit);
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      const blockers = blockersOf(error);
      if (blockers.length) setServerBlockers(blockers);
      toast.error(blockers.length ? "Some required information is missing." : errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  /** Next: the type comes first – everything after it depends on it. */
  function next() {
    if (step === STEP.TYPE && !values.typeId) {
      setShowErrors(true);
      toast.error("Choose the type of event first.");
      return;
    }
    goTo(step + 1);
  }

  const maxBytes = (system?.evidenceMaxUploadMb ?? 2) * 1024 * 1024;
  const last = step === STEPS.length - 1;
  const titleMissing = showErrors && !values.title.trim();
  const typeMissing = showErrors && !values.typeId;
  const activeSubtypes = type?.subtypes.filter((s) => s.isActive) ?? [];

  return (
    <>
      {guard.dialog}
      <PageHeader
        title={incident ? `Edit ${incident.reference}` : "Report an incident"}
        description={incident ? "Change the report. The questions it was reported with stay the same." : "Record what happened as soon as it is safe to do so. You can save a draft at any time."}
        backHref={incident ? `/incidents/${incident.id}` : "/incidents"}
        backLabel={incident ? incident.reference : "Incidents"}
      />
      {!online && !incident && (
        <Alert className="mb-4 border-warning/40 bg-warning/10">
          <CloudOff className="size-4" />
          <AlertDescription>You’re offline. Your report will be saved on this device and sent when you sync.</AlertDescription>
        </Alert>
      )}
      {stale && <StaleVersionAlert className="mb-4" draft={values} draftName="incident-report" onReload={() => window.location.reload()} />}

      <nav aria-label="Progress" className="mb-4">
        <div className="mb-2 flex items-center justify-between text-sm md:hidden">
          <span className="font-medium">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5 md:hidden" />
        <ol className="hidden items-center gap-2 md:flex">
          {STEPS.map((title, i) => (
            <li key={title} className="flex flex-1 items-center gap-2">
              <button type="button" onClick={() => goTo(i)} className={cn("flex items-center gap-2 text-sm", i === step ? "font-semibold" : "text-muted-foreground hover:text-foreground")}>
                <span className={cn("flex size-7 items-center justify-center rounded-full text-xs font-semibold", i === step ? "bg-brand text-brand-foreground" : i < step ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                {title}
              </button>
              {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < step ? "bg-brand/40" : "bg-border")} />}
            </li>
          ))}
        </ol>
      </nav>

      <form onSubmit={(e) => e.preventDefault()} noValidate>
        <Card className="mb-36 md:mb-6">
          <CardContent className="space-y-5 p-4 md:p-6">
            {step === STEP.TYPE && (
              <>
                <div>
                  <h2 id="r-type-heading" className="text-lg font-semibold">
                    What kind of event was it? *
                  </h2>
                  <p className="text-sm text-muted-foreground">Choose the one that fits best. You can change it later without losing what you entered.</p>
                </div>
                <AnonymousChoice value={values.anonymous} onChange={(anonymous) => set({ anonymous })} locked={Boolean(incident)} compact />
                <div role="group" aria-labelledby="r-type-heading" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {types.map((t) => (
                    <TypeCard key={t.id} type={t} selected={values.typeId === t.id} onChoose={() => chooseType(t.id)} />
                  ))}
                  {editType && (
                    <div className="flex min-h-20 items-start gap-3 rounded-xl border border-brand bg-brand-soft p-4 ring-1 ring-brand">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                        <ShieldAlert className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base font-semibold text-brand">{incident?.typeLabel}</span>
                        <span className="block text-xs text-muted-foreground">No longer offered for new reports</span>
                      </span>
                    </div>
                  )}
                </div>
                {typeMissing && (
                  <p role="alert" className="text-sm text-destructive">
                    Choose the type of event to continue.
                  </p>
                )}
              </>
            )}

            {step === STEP.WHAT && (
              <>
                <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 py-1.5 pr-1.5 pl-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground">Type of event: </span>
                    <span className="font-semibold">{type?.name ?? incident?.typeLabel ?? "not chosen yet"}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" className="shrink-0 text-brand" onClick={() => goTo(STEP.TYPE)}>
                    {values.typeId ? "Change" : "Choose"}
                  </Button>
                </div>
                {type && activeSubtypes.length > 1 && (
                  <Field>
                    <FieldLabel htmlFor="r-subtype">Subtype *</FieldLabel>
                    <SimpleSelect id="r-subtype" value={values.subtypeId} onChange={(v) => set({ subtypeId: v })} options={activeSubtypes.map((s) => ({ value: s.id, label: s.name }))} />
                  </Field>
                )}
                <Field data-invalid={titleMissing || undefined}>
                  <FieldLabel htmlFor="r-title">Incident title *</FieldLabel>
                  <Input id="r-title" value={values.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Loose ladder foot spotted before use" aria-invalid={titleMissing || undefined} />
                  <FieldDescription>A short name. Describe what happened below.</FieldDescription>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="r-when">Date and time of event *</FieldLabel>
                    <Input
                      id="r-when"
                      type="datetime-local"
                      value={values.occurredAt}
                      max={toLocalInput(new Date().toISOString())}
                      onChange={(e) =>
                        set({
                          occurredAt: e.target.value,
                          ...(values.targetTouched || !e.target.value ? {} : { investigationTargetDate: addDaysLocal(e.target.value.slice(0, 10), type?.targetDays ?? 7) }),
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Severity *</FieldLabel>
                    <ToggleGroup type="single" variant="outline" value={values.severity} onValueChange={(v) => v && set({ severity: v as Severity })} className="w-full">
                      {SEVERITIES.map((s) => (
                        <ToggleGroupItem key={s} value={s} className="flex-1">
                          {SEVERITY_LABELS[s]}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="r-dept">Department *</FieldLabel>
                    <DepartmentSelect id="r-dept" value={values.departmentId} onChange={(v) => set({ departmentId: v })} />
                    <FieldDescription>Sets the site and location{departmentName ? "" : "."}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="r-where">Precise location</FieldLabel>
                    <Input id="r-where" value={values.preciseLocation} onChange={(e) => set({ preciseLocation: e.target.value })} placeholder="e.g. Workshop, loading bay 2" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="r-shift">Shift</FieldLabel>
                    <LookupLabelSelect id="r-shift" listKey="incident.shift" value={values.shift} onChange={(v) => set({ shift: v })} allowNone noneLabel="Not specified" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="r-target">Investigation target date *</FieldLabel>
                    <Input id="r-target" type="date" value={values.investigationTargetDate} onChange={(e) => set({ investigationTargetDate: e.target.value, targetTouched: true })} />
                    <FieldDescription>{type ? `Defaults to ${type.targetDays} days after the event.` : "Set by the incident type."}</FieldDescription>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="r-what">What happened? *</FieldLabel>
                  <Textarea id="r-what" rows={5} value={values.narrative} onChange={(e) => set({ narrative: e.target.value })} placeholder="Describe the event in your own words." />
                </Field>
                {customSnapshot && customSnapshot.fields.length > 0 && (
                  <div className="space-y-3 border-t pt-4">
                    <h2 className="text-base font-semibold">More about what happened</h2>
                    <QuestionnaireForm snapshot={customSnapshot} value={values.answers} onChange={(answers) => set({ answers })} errors={showErrors ? answerCheck.errors : undefined} idPrefix="r-q" />
                  </div>
                )}
              </>
            )}

            {step === STEP.PEOPLE && (
              <>
                <div>
                  <h2 className="text-lg font-semibold">Who was involved?</h2>
                  <p className="text-sm text-muted-foreground">People injured, involved or who saw it. Enter Unknown if a name is not known.</p>
                </div>
                <PeopleEditor value={values.people} onChange={(people) => set({ people })} showErrors={showErrors} />
                <div className="grid gap-4 border-t pt-4">
                  <Field>
                    <FieldLabel htmlFor="r-immediate">Immediate action taken</FieldLabel>
                    <Textarea id="r-immediate" rows={3} value={values.immediateAction} onChange={(e) => set({ immediateAction: e.target.value })} placeholder="e.g. Area made safe, equipment removed from service" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="r-firstaid">First aid, treatment and outcome</FieldLabel>
                    <Textarea id="r-firstaid" rows={3} value={values.firstAid} onChange={(e) => set({ firstAid: e.target.value })} placeholder="e.g. Cleaned and dressed by the first aider; returned to work" />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={values.nurseNotified} onCheckedChange={(c) => set({ nurseNotified: c === true })} /> The nurse / occupational health was notified
                  </label>
                </div>
                {!incident && attachmentsAllowed && (
                  <div className="space-y-2 border-t pt-4">
                    <h3 className="text-sm font-medium">Photos and files</h3>
                    {files.length > 0 && (
                      <ul className="space-y-1">
                        {files.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                            <Paperclip className="size-4 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                            <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                            <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                              <X />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <input
                      ref={fileInput}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const picked = [...(e.target.files ?? [])];
                        const tooBig = picked.filter((f) => f.size > maxBytes);
                        if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(", ")} is larger than ${formatBytes(maxBytes)}.`);
                        setFiles([...files, ...picked.filter((f) => f.size <= maxBytes)].slice(0, 20));
                        e.target.value = "";
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                      <Plus /> Add photos or files
                    </Button>
                    <p className="text-xs text-muted-foreground">Up to {formatBytes(maxBytes)} each. Files are kept on this device until the report is sent.</p>
                  </div>
                )}
              </>
            )}

            {step === STEP.REVIEW && (
              <>
                <div className="grid gap-4">
                  <Field>
                    <FieldLabel htmlFor="r-investigators">
                      Who should investigate?{assignmentRequired ? " *" : ""} {!multiple && <span className="font-normal text-muted-foreground">(one person)</span>}
                    </FieldLabel>
                    <UserMultiPicker
                      id="r-investigators"
                      value={values.investigatorIds}
                      onChange={(ids) => set({ investigatorIds: multiple ? ids : ids.slice(-1) })}
                      permission={PERMISSIONS.INCIDENT_INVESTIGATE}
                      placeholder="Choose investigators…"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="r-notify">Also let these people know (optional)</FieldLabel>
                    <UserMultiPicker id="r-notify" value={values.notifyUserIds} onChange={(ids) => set({ notifyUserIds: ids })} placeholder="Choose people…" />
                    <FieldDescription>Recorded on the report – no e-mail is sent.</FieldDescription>
                  </Field>
                  {(can(PERMISSIONS.INCIDENT_TRIAGE) || can(PERMISSIONS.INCIDENT_VIEW_CONFIDENTIAL) || !incident) && (
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox className="mt-0.5" checked={values.isConfidential} onCheckedChange={(c) => set({ isConfidential: c === true })} />
                      <span>
                        Confidential
                        <span className="block text-xs text-muted-foreground">Only people allowed to see confidential details can read the people involved and what happened.</span>
                      </span>
                    </label>
                  )}
                </div>
                <AnonymousChoice value={values.anonymous} onChange={(anonymous) => set({ anonymous })} locked={Boolean(incident)} />
                <ReviewSummary values={values} typeName={type?.name ?? incident?.typeLabel ?? "—"} subtypeName={type?.subtypes.find((s) => s.id === values.subtypeId)?.name ?? incident?.subtype?.label} departmentName={departmentName} goTo={goTo} fileCount={files.length} />
                {isDraft && <BlockerList title="Before you can submit" blockers={gates} />}
                <BlockerList title="The server could not accept the report" blockers={serverBlockers} tone="destructive" />
              </>
            )}
          </CardContent>
        </Card>

        <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 px-3 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => goTo(step - 1)} disabled={step === 0 || Boolean(busy)}>
              <ArrowLeft /> <span className="hidden sm:inline">Back</span>
            </Button>
            {isDraft && (
              <Button type="button" variant="ghost" className="h-11 md:h-9" disabled={Boolean(busy)} onClick={() => void send(false)}>
                {busy === "draft" ? <Spinner /> : <Save />} {online || incident ? "Save draft" : "Save draft offline"}
              </Button>
            )}
            <div className="flex-1" />
            {last ? (
              <Button type="button" className="h-11 px-5 md:h-9" disabled={Boolean(busy)} onClick={() => void send(isDraft)}>
                {busy === "submit" ? <Spinner /> : online || incident ? <Send /> : <CloudOff />} {isDraft ? (online || incident ? "Submit report" : "Save offline") : "Save changes"}
              </Button>
            ) : (
              <Button type="button" className="h-11 px-5 md:h-9" onClick={next}>
                Next <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </form>
    </>
  );
}

/**
 * "Report anonymously". Chosen before the report is first saved; afterwards it is only shown (a
 * draft saved under a name already left the name in its history).
 */
function AnonymousChoice({ value, onChange, locked, compact = false }: { value: boolean; onChange: (v: boolean) => void; locked: boolean; compact?: boolean }) {
  if (locked) {
    if (!value) return null;
    return (
      <p className="flex items-start gap-2 rounded-xl border border-chart-2/30 bg-chart-2/5 p-3 text-sm">
        <EyeOff className="mt-0.5 size-4 shrink-0 text-chart-2" />
        <span>This report is anonymous – your name is not shown to anyone handling it.</span>
      </p>
    );
  }
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors", value ? "border-chart-2/40 bg-chart-2/5" : "bg-muted/30 hover:bg-muted/50")}>
      <Checkbox
        className="mt-0.5"
        checked={value}
        onCheckedChange={(c) => onChange(c === true)}
        aria-label="Report anonymously"
        aria-describedby={compact ? undefined : "r-anonymous-help"}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-medium">
          <EyeOff className="size-4 text-chart-2" /> Report anonymously
        </span>
        <span className="block text-xs text-muted-foreground">
          Your name is not shown to anyone handling the report – not even administrators. You can still open it later under Incidents.
        </span>
        {value && !compact && (
          <span id="r-anonymous-help" className="mt-1.5 block text-xs text-muted-foreground">
            What you write, the people you name and your photos or files can still point to you. Once the report is saved this cannot be changed.
          </span>
        )}
      </span>
    </label>
  );
}

/** A large, tappable type choice; its subtypes are listed so people can tell the types apart. */
function TypeCard({ type, selected, onChoose }: { type: ReportSetupTypeDto; selected: boolean; onChoose: () => void }) {
  const Icon = TYPE_ICONS[type.key] ?? ShieldAlert;
  const examples = type.subtypes
    .filter((s) => s.isActive)
    .map((s) => s.name)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={selected}
      className={cn(
        "flex min-h-20 items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-brand/50 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected && "border-brand bg-brand-soft ring-1 ring-brand hover:bg-brand-soft",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", selected && "bg-brand text-brand-foreground")}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-base font-semibold", selected && "text-brand")}>{type.name}</span>
        {examples && <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{examples}</span>}
      </span>
      {selected && <Check className="size-5 shrink-0 text-brand" aria-hidden />}
    </button>
  );
}

function ReviewSummary({
  values,
  typeName,
  subtypeName,
  departmentName,
  goTo,
  fileCount,
}: {
  values: ReportValues;
  typeName: string;
  subtypeName: string | undefined;
  departmentName: string | null;
  goTo: (step: number) => void;
  fileCount: number;
}) {
  const rows: [string, string, number][] = [
    ["Type", [typeName, subtypeName].filter(Boolean).join(" · "), STEP.TYPE],
    ["Title", values.title || "—", STEP.WHAT],
    ["When", values.occurredAt ? values.occurredAt.replace("T", " ") : "—", STEP.WHAT],
    ["Where", [departmentName, values.preciseLocation].filter(Boolean).join(" · ") || "—", STEP.WHAT],
    ["Severity", SEVERITY_LABELS[values.severity], STEP.WHAT],
    ["People", values.people.length ? values.people.map((p) => p.name || "(no name)").join(", ") : "Nobody added", STEP.PEOPLE],
    ["Files", fileCount ? `${fileCount} attached` : "None", STEP.PEOPLE],
  ];
  return (
    <div className="rounded-xl border">
      <h2 className="border-b px-4 py-2.5 text-sm font-semibold">Check your report</h2>
      <dl className="divide-y">
        {rows.map(([label, value, target]) => (
          <div key={label} className="flex items-start gap-3 px-4 py-2 text-sm">
            <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 flex-1 break-words">{value}</dd>
            <button type="button" className="text-xs text-brand hover:underline" onClick={() => goTo(target)}>
              Change
            </button>
          </div>
        ))}
      </dl>
    </div>
  );
}
