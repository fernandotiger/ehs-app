"use client";

import { CheckCircle2, ClipboardCheck, Plus, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EvidencePanel } from "@/components/common/evidence-panel";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { EmptyState } from "@/components/common/states";
import { UserPicker } from "@/components/common/user-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { QuestionnaireAnswers } from "@/features/forms/components/questionnaire-answers";
import { QuestionnaireForm } from "@/features/forms/components/questionnaire-form";
import { useLookup } from "@/features/shared/lookups";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { validateQuestionnaireAnswers, type FormValues } from "@/lib/forms";
import {
  CAUSE_GROUP_LABELS,
  CAUSE_GROUPS,
  CAUSE_LISTS,
  DURATION_UNIT_LABELS,
  DURATION_UNITS,
  inclusiveDays,
  isRestrictedKind,
  REPORTEE_KIND_LABELS,
  type CauseGroupKey,
  type DurationUnitKey,
} from "@/lib/incidents";
import { PERMISSIONS } from "@/lib/permissions";
import type { AbsenceInput } from "@/lib/validation/incidents";
import { investigationCompletionBlockers } from "@/server/modules/incidents/workflow";
import { useReopenInvestigation, useSaveInvestigation, type IncidentDetailDto, type InvestigationDto } from "../../api";
import { blockersOf, formatDate, formatDateTime } from "../../format";
import { enumOptions, LookupLabelSelect, SimpleSelect } from "../fields";
import { BlockerList, Detail, SectionHeading } from "../shared";

interface Values {
  investigatorId: string | null;
  answers: FormValues;
  healthSafetyImpact: boolean;
  hazardGroup: string | null;
  environmentalImpact: boolean;
  environmentalAspect: string | null;
  environmentalDescription: string;
  environmentalDuration: string;
  environmentalDurationUnit: DurationUnitKey;
  causeIds: string[];
  reportable: boolean;
  reporteeIds: string[];
  absences: AbsenceInput[];
  operatingHoursLost: string;
  actionsRequired: boolean | null;
  closingDecision: string;
}

function toValues(inv: InvestigationDto): Values {
  return {
    investigatorId: inv.investigator?.id ?? null,
    answers: inv.answers,
    healthSafetyImpact: inv.healthSafetyImpact,
    hazardGroup: inv.hazardGroup,
    environmentalImpact: inv.environmentalImpact,
    environmentalAspect: inv.environmentalAspect,
    environmentalDescription: inv.environmentalDescription ?? "",
    environmentalDuration: inv.environmentalDuration?.toString() ?? "",
    environmentalDurationUnit: inv.environmentalDurationUnit ?? "MINUTES",
    causeIds: inv.causes.map((c) => c.id),
    reportable: inv.reportable,
    reporteeIds: inv.reportees.map((r) => r.id),
    absences: inv.absences.map((a) => ({ startDate: a.startDate, endDate: a.endDate, kind: a.kind, note: a.note })),
    operatingHoursLost: inv.operatingHoursLost?.toString() ?? "",
    actionsRequired: inv.actionsRequired,
    closingDecision: inv.closingDecision ?? "",
  };
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function InvestigationTab({ incident, onStart }: { incident: IncidentDetailDto; onStart: () => void }) {
  const inv = incident.investigation;
  if (!incident.type.investigationEnabled) {
    return <EmptyState icon={ClipboardCheck} title="No investigation for this type" description={`${incident.typeLabel} incidents are closed without an investigation once any actions are verified.`} />;
  }
  if (!inv) {
    return (
      <EmptyState
        icon={Search}
        title={incident.isDraft ? "Submit the report first" : "No investigation yet"}
        description={incident.isDraft ? "An investigation starts once the report has been submitted." : "Start the investigation to record findings, root cause, causes and losses."}
        action={
          !incident.isDraft && !incident.closedAt && incident.permissions.investigate ? (
            <Button onClick={onStart}>
              <Search /> Start investigation
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (inv.status === "IN_PROGRESS" && incident.permissions.investigate && !incident.closedAt) return <InvestigationForm key={inv.version} incident={incident} inv={inv} />;
  return <InvestigationView incident={incident} inv={inv} />;
}

function CausePicker({ value, onChange, current }: { value: string[]; onChange: (ids: string[]) => void; current: InvestigationDto["causes"] }) {
  const lists = {
    EQUIPMENT: useLookup(CAUSE_LISTS.EQUIPMENT),
    MATERIALS: useLookup(CAUSE_LISTS.MATERIALS),
    METHODS: useLookup(CAUSE_LISTS.METHODS),
    PEOPLE: useLookup(CAUSE_LISTS.PEOPLE),
    WORKPLACE: useLookup(CAUSE_LISTS.WORKPLACE),
  } satisfies Record<CauseGroupKey, ReturnType<typeof useLookup>>;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CAUSE_GROUPS.map((group) => {
        const options = (lists[group].data ?? []).map((v) => ({ id: v.id, label: v.label }));
        for (const c of current) if (c.group === group && !options.some((o) => o.id === c.id)) options.push({ id: c.id, label: `${c.label} (no longer offered)` });
        return (
          <fieldset key={group} className="rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{CAUSE_GROUP_LABELS[group]}</legend>
            {options.length === 0 && <p className="text-xs text-muted-foreground">No causes in this group.</p>}
            <div className="space-y-1.5">
              {options.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={value.includes(o.id)} onCheckedChange={() => toggle(o.id)} /> {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function ReporteePicker({ value, onChange, current }: { value: string[]; onChange: (ids: string[]) => void; current: InvestigationDto["reportees"] }) {
  const internal = useLookup("incident.reportee.internal");
  const external = useLookup("incident.reportee.external");
  const options = [
    ...(internal.data ?? []).map((v) => ({ id: v.id, label: v.label, kind: "INTERNAL" as const, destination: v.notes })),
    ...(external.data ?? []).map((v) => ({ id: v.id, label: v.label, kind: "EXTERNAL" as const, destination: v.notes })),
  ];
  for (const r of current) if (!options.some((o) => o.id === r.id)) options.push({ id: r.id, label: `${r.label} (no longer offered)`, kind: r.kind, destination: r.destination });
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-1.5">
      {options.map((o) => (
        <label key={o.id} className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" checked={value.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
          <span>
            {o.label} <span className="text-xs text-muted-foreground">· {REPORTEE_KIND_LABELS[o.kind]}</span>
            {o.destination && <span className="block text-xs text-muted-foreground">{o.destination}</span>}
          </span>
        </label>
      ))}
      <p className="text-xs text-muted-foreground">Choosing a reportee records who it must be reported to – nothing is sent automatically.</p>
    </div>
  );
}

function InvestigationForm({ incident, inv }: { incident: IncidentDetailDto; inv: InvestigationDto }) {
  const [start] = useState(() => toValues(inv));
  const [v, setV] = useState<Values>(start);
  const [serverBlockers, setServerBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const save = useSaveInvestigation(incident.id);
  const kinds = useLookup("incident.absence-kind");
  const dirty = JSON.stringify(v) !== JSON.stringify(start);
  const guard = useUnsavedChangesGuard(dirty);
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const formSnapshot = useMemo(() => (inv.form ? { ...inv.form, fields: inv.form.fields.filter((f) => !inv.hiddenAnswerKeys.includes(f.key)) } : null), [inv]);

  const restricted = (kind: string) => {
    const k = kinds.data?.find((x) => x.label === kind);
    return k ? isRestrictedKind(k) : kind.toLowerCase() === "restricted duties";
  };
  const daysLost = v.absences.filter((a) => !restricted(a.kind)).reduce((s, a) => s + (a.startDate && a.endDate ? inclusiveDays(a.startDate, a.endDate) : 0), 0);

  const missingAnswers = useMemo(() => {
    if (!formSnapshot) return [];
    const r = validateQuestionnaireAnswers(formSnapshot, v.answers, { mode: "submit" });
    return Object.entries(r.errors).map(([key, msg]) => (/is required$/.test(msg) ? (formSnapshot.fields.find((f) => f.key === key)?.label ?? key) : msg));
  }, [formSnapshot, v.answers]);

  const gates = investigationCompletionBlockers({
    investigatorId: v.investigatorId,
    causeIds: v.causeIds,
    closingDecision: v.closingDecision,
    actionsRequired: v.actionsRequired,
    healthSafetyImpact: v.healthSafetyImpact,
    hazardGroup: v.hazardGroup,
    environmentalImpact: v.environmentalImpact,
    environmentalAspect: v.environmentalAspect,
    environmentalDescription: v.environmentalDescription,
    environmentalDuration: num(v.environmentalDuration),
    reportable: v.reportable,
    reporteeIds: v.reporteeIds,
    absences: v.absences,
    operatingHoursLost: num(v.operatingHoursLost),
    missingAnswers,
  });

  async function submit(complete: boolean) {
    setServerBlockers([]);
    try {
      await save.mutateAsync({
        expectedVersion: inv.version,
        investigatorId: v.investigatorId,
        answers: v.answers,
        healthSafetyImpact: v.healthSafetyImpact,
        hazardGroup: v.healthSafetyImpact ? v.hazardGroup : null,
        environmentalImpact: v.environmentalImpact,
        environmentalAspect: v.environmentalImpact ? v.environmentalAspect : null,
        environmentalDescription: v.environmentalImpact ? v.environmentalDescription || null : null,
        environmentalDuration: v.environmentalImpact ? num(v.environmentalDuration) : null,
        environmentalDurationUnit: v.environmentalDurationUnit,
        causeIds: v.causeIds,
        reportable: v.reportable,
        reporteeIds: v.reportable ? v.reporteeIds : [],
        absences: v.absences,
        operatingHoursLost: num(v.operatingHoursLost),
        actionsRequired: v.actionsRequired,
        closingDecision: v.closingDecision || null,
        complete,
      });
      toast.success(complete ? "Investigation completed – the incident stays open until it is closed." : "Investigation saved");
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      setServerBlockers(blockersOf(error));
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      {guard.dialog}
      {stale && <StaleVersionAlert draft={v} draftName="investigation" onReload={() => window.location.reload()} />}
      <Card>
        <CardHeader>
          <CardTitle>Investigation</CardTitle>
          <CardDescription>
            In progress since {formatDate(inv.startedAt)} · form “{inv.form?.name}” v{inv.form?.version}. Save as you go; complete when everything is recorded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field>
            <FieldLabel htmlFor="i-investigator">Investigator *</FieldLabel>
            <UserPicker id="i-investigator" value={v.investigatorId} onChange={(id) => set({ investigatorId: id })} permission={PERMISSIONS.INCIDENT_INVESTIGATE} />
          </Field>
          {formSnapshot && <QuestionnaireForm snapshot={formSnapshot} value={v.answers} onChange={(answers) => set({ answers })} idPrefix="i-q" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Impact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={v.healthSafetyImpact} onCheckedChange={(c) => set({ healthSafetyImpact: c })} /> Health & safety impact
          </label>
          {v.healthSafetyImpact && (
            <Field>
              <FieldLabel htmlFor="i-hazard">Hazard group *</FieldLabel>
              <LookupLabelSelect id="i-hazard" listKey="incident.hazard-group" value={v.hazardGroup} onChange={(x) => set({ hazardGroup: x })} />
            </Field>
          )}
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={v.environmentalImpact} onCheckedChange={(c) => set({ environmentalImpact: c })} /> Environmental impact
          </label>
          {v.environmentalImpact && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="i-aspect">Environmental aspect *</FieldLabel>
                <LookupLabelSelect id="i-aspect" listKey="incident.environmental-aspect" value={v.environmentalAspect} onChange={(x) => set({ environmentalAspect: x })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="i-duration">Duration (optional)</FieldLabel>
                <div className="flex gap-2">
                  <Input id="i-duration" type="number" min={0} value={v.environmentalDuration} onChange={(e) => set({ environmentalDuration: e.target.value })} className="w-28" />
                  <SimpleSelect value={v.environmentalDurationUnit} onChange={(x) => set({ environmentalDurationUnit: (x ?? "MINUTES") as DurationUnitKey })} options={enumOptions(DURATION_UNITS, DURATION_UNIT_LABELS)} />
                </div>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="i-envdesc">Impact description *</FieldLabel>
                <Textarea id="i-envdesc" rows={2} value={v.environmentalDescription} onChange={(e) => set({ environmentalDescription: e.target.value })} />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Causes *</CardTitle>
          <CardDescription>Choose at least one contributing cause.</CardDescription>
        </CardHeader>
        <CardContent>
          <CausePicker value={v.causeIds} onChange={(causeIds) => set({ causeIds })} current={inv.causes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reporting and losses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={v.reportable} onCheckedChange={(c) => set({ reportable: c })} /> Reportable
          </label>
          {v.reportable && <ReporteePicker value={v.reporteeIds} onChange={(reporteeIds) => set({ reporteeIds })} current={inv.reportees} />}
          <div className="space-y-2">
            <p className="text-sm font-medium">Absence periods</p>
            {v.absences.map((a, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
                <Input type="date" aria-label="Start date" value={a.startDate} onChange={(e) => set({ absences: v.absences.map((x, j) => (j === i ? { ...x, startDate: e.target.value } : x)) })} />
                <Input type="date" aria-label="End date" value={a.endDate} onChange={(e) => set({ absences: v.absences.map((x, j) => (j === i ? { ...x, endDate: e.target.value } : x)) })} />
                <LookupLabelSelect listKey="incident.absence-kind" value={a.kind} onChange={(x) => set({ absences: v.absences.map((y, j) => (j === i ? { ...y, kind: x ?? "" } : y)) })} placeholder="Kind of absence" />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove period" onClick={() => set({ absences: v.absences.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
                <Input className="sm:col-span-4" placeholder="Note (optional)" value={a.note ?? ""} onChange={(e) => set({ absences: v.absences.map((x, j) => (j === i ? { ...x, note: e.target.value || null } : x)) })} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => set({ absences: [...v.absences, { startDate: "", endDate: "", kind: "Lost time injury", note: null }] })}>
              <Plus /> Add absence period
            </Button>
            <p className="text-sm">
              Days lost: <strong className="tabular-nums">{daysLost}</strong> <span className="text-muted-foreground">(inclusive calendar days; Restricted duties not counted)</span>
            </p>
          </div>
          <Field className="max-w-xs">
            <FieldLabel htmlFor="i-hours">Operating hours lost</FieldLabel>
            <Input id="i-hours" type="number" min={0} step="0.5" value={v.operatingHoursLost} onChange={(e) => set({ operatingHoursLost: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel>Are actions required? *</FieldLabel>
            <SimpleSelect
              value={v.actionsRequired === null ? null : v.actionsRequired ? "yes" : "no"}
              onChange={(x) => set({ actionsRequired: x === null ? null : x === "yes" })}
              options={[
                { value: "yes", label: "Yes – corrective or preventive action is needed" },
                { value: "no", label: "No – no action is needed" },
              ]}
              placeholder="Choose…"
              className="sm:w-96"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="i-decision">Closing decision *</FieldLabel>
            <Textarea id="i-decision" rows={3} value={v.closingDecision} onChange={(e) => set({ closingDecision: e.target.value })} placeholder="e.g. Replace the ladder and update checks" />
            <FieldDescription>Completing the investigation does not close the incident or its actions.</FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <EvidencePanel entityType="Investigation" entityId={inv.id} title="Investigation evidence" />

      <BlockerList title="To complete the investigation" blockers={gates} />
      <BlockerList title="Not saved" blockers={serverBlockers} tone="destructive" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => void submit(false)} disabled={save.isPending}>
          {save.isPending ? <Spinner /> : <Save />} Save progress
        </Button>
        <ConfirmDialog
          trigger={
            <Button disabled={save.isPending || gates.length > 0}>
              <CheckCircle2 /> Complete investigation
            </Button>
          }
          title="Complete the investigation?"
          description="It can be reopened later if something changes. The incident stays open until its actions are verified and it is closed."
          confirmLabel="Complete"
          onConfirm={() => submit(true)}
        />
      </div>
    </div>
  );
}

function InvestigationView({ incident, inv }: { incident: IncidentDetailDto; inv: InvestigationDto }) {
  const reopen = useReopenInvestigation(incident.id);
  const formSnapshot = inv.form ? { ...inv.form, fields: inv.form.fields } : null;
  const canReopen = inv.status === "COMPLETED" && !incident.closedAt && (incident.permissions.investigate || incident.permissions.close);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <SectionHeading
            title={inv.status === "COMPLETED" ? "Investigation completed" : "Investigation in progress"}
            description={
              inv.status === "COMPLETED"
                ? `Completed ${formatDateTime(inv.completedAt)}${inv.completedBy ? ` by ${inv.completedBy.name}` : ""}. Reopen it to make changes.`
                : "Only the investigator or an EHS lead can edit it."
            }
            actions={
              canReopen ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <RotateCcw /> Reopen investigation
                    </Button>
                  }
                  title="Reopen the investigation?"
                  description="Its history is kept. The incident cannot be closed until the investigation is completed again."
                  confirmLabel="Reopen"
                  onConfirm={async () => {
                    try {
                      await reopen.mutateAsync(inv.version);
                      toast.success("Investigation reopened");
                    } catch (error) {
                      toast.error(errorMessage(error));
                    }
                  }}
                />
              ) : undefined
            }
          />
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <Detail label="Investigator">{inv.investigator?.name}</Detail>
            {incident.confidentialHidden ? (
              <Detail label="Findings">Confidential – hidden</Detail>
            ) : (
              formSnapshot && (
                <div className="border-y py-3">
                  <QuestionnaireAnswers snapshot={formSnapshot} answers={inv.answers} hideKeys={inv.hiddenAnswerKeys} />
                </div>
              )
            )}
            <Detail label="Health & safety impact">{inv.healthSafetyImpact ? `Yes · ${inv.hazardGroup ?? "—"}` : "No"}</Detail>
            <Detail label="Environmental impact">
              {inv.environmentalImpact
                ? `Yes · ${inv.environmentalAspect ?? "—"}${inv.environmentalDuration != null ? ` · ${inv.environmentalDuration} ${DURATION_UNIT_LABELS[inv.environmentalDurationUnit ?? "MINUTES"].toLowerCase()}` : ""}\n${inv.environmentalDescription ?? ""}`
                : "No"}
            </Detail>
            <Detail label="Causes">{inv.causes.length ? inv.causes.map((c) => `${CAUSE_GROUP_LABELS[c.group]} → ${c.label}`).join("\n") : null}</Detail>
            <Detail label="Reportable">{inv.reportable ? `Yes · ${inv.reportees.map((r) => `${r.label} (${REPORTEE_KIND_LABELS[r.kind]})`).join(", ")}` : "No"}</Detail>
            <Detail label="Absence periods">
              {inv.absences.length
                ? inv.absences.map((a) => `${formatDate(a.startDate)} – ${formatDate(a.endDate)} · ${a.kind}${a.restricted ? " (not counted)" : ` · ${a.days} day${a.days === 1 ? "" : "s"}`}`).join("\n")
                : "None"}
            </Detail>
            <Detail label="Days lost">{inv.daysLost}</Detail>
            <Detail label="Operating hours lost">{inv.operatingHoursLost ?? "—"}</Detail>
            <Detail label="Actions required">{inv.actionsRequired === null ? "Not decided" : inv.actionsRequired ? "Yes" : "No"}</Detail>
            <Detail label="Closing decision">{inv.closingDecision}</Detail>
          </dl>
        </CardContent>
      </Card>
      <EvidencePanel entityType="Investigation" entityId={inv.id} title="Investigation evidence" readOnly />
    </div>
  );
}
