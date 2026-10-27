"use client";

import { ArrowDown, ArrowUp, Check, Pencil, Plus, Power, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActiveBadge, ConfigHeader } from "@/features/configuration/components/shared";
import { useFormLibrary } from "@/features/forms/api";
import { useCreateLookupValue, useLookup, useUpdateLookupValue } from "@/features/shared/lookups";
import { useSaveSetting, useSetting } from "@/features/shared/settings";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { fieldsForSite, FORM_FIELD_TYPE_LABELS, isAnswerable } from "@/lib/forms";
import { answerColumn, ANSWER_COLUMN_PREFIX, CAUSE_GROUP_LABELS, CAUSE_GROUPS, CAUSE_LISTS, REPORTEE_KIND_LABELS, REPORTEE_KINDS, REPORTEE_LISTS, STANDARD_EXPORT_COLUMNS, type ReporteeKindKey } from "@/lib/incidents";
import type { LookupListKey } from "@/lib/lookups";
import type { IncidentSettings } from "@/lib/settings/incident";
import { useCreateIncidentType, useIncidentTypes, useReportSetup, useSubtypeMutation, useUpdateIncidentType, type IncidentTypeDto } from "../../api";
import { blockersOf } from "../../format";
import { SimpleSelect, SiteSelect } from "../fields";
import { BlockerList } from "../shared";

/** Configuration → Incident settings: types + subtypes, causes, reportees, export columns, site question preview. */
export function IncidentSettings() {
  return (
    <>
      <ConfigHeader title="Incident settings" description="Incident types and their rules, causes, reportees, export columns and the questions people see." />
      <Tabs defaultValue="types" className="gap-4">
        <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
          <TabsList>
            <TabsTrigger value="types">Types & subtypes</TabsTrigger>
            <TabsTrigger value="causes">Causes</TabsTrigger>
            <TabsTrigger value="reportees">Reportees</TabsTrigger>
            <TabsTrigger value="export">Export columns</TabsTrigger>
            <TabsTrigger value="questions">Site questions</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="types">
          <TypesTab />
        </TabsContent>
        <TabsContent value="causes">
          <div className="grid gap-4 lg:grid-cols-2">
            {CAUSE_GROUPS.map((g) => (
              <ListEditor key={g} listKey={CAUSE_LISTS[g]} title={`${CAUSE_GROUP_LABELS[g]} causes`} placeholder="New cause" />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="reportees">
          <div className="grid gap-4 lg:grid-cols-2">
            {REPORTEE_KINDS.map((k) => (
              <ListEditor key={k} listKey={REPORTEE_LISTS[k]} title={`${REPORTEE_KIND_LABELS[k]} reportees`} placeholder="Name" withNotes notesLabel="Destination / reporting channel" kind={k} />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="export">
          <ExportColumns />
        </TabsContent>
        <TabsContent value="questions">
          <SiteQuestions />
        </TabsContent>
      </Tabs>
    </>
  );
}

function TypesTab() {
  const types = useIncidentTypes(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (types.isPending) return <LoadingRows rows={6} />;
  if (types.isError) return <ErrorState error={types.error} onRetry={() => types.refetch()} />;
  const list = types.data;
  const selected = list.find((t) => t.id === selectedId) ?? list[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <CreateTypeDialog types={list} open={creating} onOpenChange={setCreating} onCreated={(t) => setSelectedId(t.id)} />
      <Card className="h-fit gap-0 py-0">
        <div className="border-b p-3">
          <Button className="w-full" variant="outline" onClick={() => setCreating(true)}>
            <Plus /> Add type
          </Button>
        </div>
        <ul className="py-2" aria-label="Incident types">
          {list.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-muted/50 ${selected?.id === t.id ? "bg-brand-soft font-semibold text-brand" : ""}`}
              >
                <span>{t.name}</span>
                {!t.isActive && <StatusBadge>Inactive</StatusBadge>}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {selected && <TypeEditor key={`${selected.id}-${selected.version}`} type={selected} />}
    </div>
  );
}

function FormBindingSelect({ purpose, value, onChange, id }: { purpose: "REPORT" | "INVESTIGATION"; value: string | null; onChange: (formId: string | null) => void; id: string }) {
  const forms = useFormLibrary({ module: "incidents" });
  const options = (forms.data ?? []).filter((f) => f.purpose === purpose && f.currentVersion > 0).map((f) => ({ value: f.id, label: `${f.name} · v${f.currentVersion}` }));
  return <SimpleSelect id={id} value={value} onChange={onChange} options={options} allowNone noneLabel="No form" placeholder={forms.isPending ? "Loading…" : "Choose a published form"} />;
}

/** Add type: name, first subtype and the forms (prefilled with the ones most types use). The rest is set in the editor. */
function CreateTypeDialog({
  types,
  open,
  onOpenChange,
  onCreated,
}: {
  types: IncidentTypeDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (type: IncidentTypeDto) => void;
}) {
  const create = useCreateIncidentType();
  const forms = useFormLibrary({ module: "incidents" });
  /** The published form most existing types are bound to (ties: library order). */
  const usualForm = (purpose: "REPORT" | "INVESTIGATION") => {
    const uses = new Map<string, number>();
    for (const t of types) {
      const id = (purpose === "REPORT" ? t.reportForm : t.investigationForm)?.formId;
      if (id) uses.set(id, (uses.get(id) ?? 0) + 1);
    }
    const published = (forms.data ?? []).filter((f) => f.purpose === purpose && f.currentVersion > 0);
    return published.sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0))[0]?.id ?? null;
  };
  const [name, setName] = useState("");
  const [subtype, setSubtype] = useState("General");
  // undefined = not touched yet → the usual form of that purpose.
  const [reportFormId, setReportFormId] = useState<string | null | undefined>(undefined);
  const [investigationFormId, setInvestigationFormId] = useState<string | null | undefined>(undefined);
  const [errors, setErrors] = useState<{ name?: string; subtype?: string; form?: string }>({});
  const report = reportFormId === undefined ? usualForm("REPORT") : reportFormId;
  const investigation = investigationFormId === undefined ? usualForm("INVESTIGATION") : investigationFormId;

  function close(next: boolean) {
    if (!next) {
      setName("");
      setSubtype("General");
      setReportFormId(undefined);
      setInvestigationFormId(undefined);
      setErrors({});
    }
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const missing = { name: name.trim() ? undefined : "Enter a name for the type", subtype: subtype.trim() ? undefined : "Enter a first subtype" };
    if (missing.name || missing.subtype) {
      setErrors(missing);
      return;
    }
    try {
      const type = await create.mutateAsync({ name: name.trim(), subtype: subtype.trim(), reportFormId: report, investigationFormId: investigation });
      toast.success(type.isActive ? `${type.name} added – people can now choose it when reporting` : `${type.name} added as inactive – choose a report form to switch it on`);
      close(false);
      onCreated(type);
    } catch (error) {
      const blockers = blockersOf(error);
      const message = blockers.length ? blockers.join(" ") : errorMessage(error);
      setErrors(/already exists/i.test(message) ? { name: message } : { form: message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New incident type</DialogTitle>
          <DialogDescription>Starts with the usual settings. You can change them, add subtypes and switch it off after creating it.</DialogDescription>
        </DialogHeader>
        <form id="create-incident-type" onSubmit={submit} noValidate>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="new-type-name">Name *</FieldLabel>
              <Input
                id="new-type-name"
                value={name}
                maxLength={80}
                autoComplete="off"
                placeholder="e.g. Chemical exposure"
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors({});
                }}
                aria-invalid={Boolean(errors.name)}
              />
              <FieldError errors={errors.name ? [{ message: errors.name }] : []} />
            </Field>
            <Field data-invalid={Boolean(errors.subtype)}>
              <FieldLabel htmlFor="new-type-subtype">First subtype *</FieldLabel>
              <Input
                id="new-type-subtype"
                value={subtype}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => {
                  setSubtype(e.target.value);
                  setErrors({});
                }}
                aria-invalid={Boolean(errors.subtype)}
              />
              <FieldDescription>Add more subtypes after creating the type.</FieldDescription>
              <FieldError errors={errors.subtype ? [{ message: errors.subtype }] : []} />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-type-report">Report form</FieldLabel>
              <FormBindingSelect id="new-type-report" purpose="REPORT" value={report} onChange={(id) => setReportFormId(id)} />
              <FieldDescription>The questions people answer when they report. Without one the type is saved as inactive.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="new-type-inv">Investigation form</FieldLabel>
              <FormBindingSelect id="new-type-inv" purpose="INVESTIGATION" value={investigation} onChange={(id) => setInvestigationFormId(id)} />
              <FieldDescription>With a form, incidents need an investigation before they can be closed. You can change this in the type settings.</FieldDescription>
            </Field>
            {errors.form && <BlockerList title="Not added" blockers={[errors.form]} tone="destructive" />}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-incident-type" disabled={create.isPending}>
            {create.isPending ? <Spinner /> : <Plus />} Add type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TypeEditor({ type }: { type: IncidentTypeDto }) {
  const initial = {
    name: type.name,
    isActive: type.isActive,
    multipleInvestigators: type.multipleInvestigators,
    assignmentRequired: type.assignmentRequired,
    investigationEnabled: type.investigationEnabled,
    investigationRequired: type.investigationRequired,
    defaultConfidential: type.defaultConfidential,
    attachmentsAllowed: type.attachmentsAllowed,
    targetDays: String(type.targetDays),
    reportFormId: type.reportForm?.formId ?? null,
    investigationFormId: type.investigationForm?.formId ?? null,
  };
  const [v, setV] = useState(initial);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const update = useUpdateIncidentType(type.id);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const guard = useUnsavedChangesGuard(dirty);
  const days = Number(v.targetDays);
  const daysInvalid = !Number.isInteger(days) || days < 1 || days > 365;
  const nameInvalid = !v.name.trim();
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  const toggles: [Exclude<keyof typeof v, "name">, string, string][] = [
    ["isActive", "Active", "Offered when reporting a new incident."],
    ["multipleInvestigators", "Several investigators", "Off = one investigator per incident."],
    ["assignmentRequired", "Investigator required to submit", "A report cannot be submitted without an investigator."],
    ["investigationEnabled", "Investigation enabled", "Incidents of this type can be investigated."],
    ["investigationRequired", "Investigation required before closing", "Needs investigations enabled and a published investigation form."],
    ["defaultConfidential", "Confidential by default", "New reports start as confidential."],
    ["attachmentsAllowed", "Attachments allowed", "Photos and files can be added."],
  ];

  async function save() {
    setBlockers([]);
    try {
      await update.mutateAsync({ ...v, name: v.name.trim(), targetDays: days, expectedVersion: type.version });
      toast.success(`${v.name.trim()} saved`);
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      setBlockers(blockersOf(error));
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      {guard.dialog}
      {stale && <StaleVersionAlert draft={v} draftName="incident-type" onReload={() => window.location.reload()} />}
      <Card>
        <CardHeader>
          <CardTitle>{type.name}</CardTitle>
          <CardDescription>Changes apply to new reports; existing incidents keep the forms and labels they were reported with.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field data-invalid={nameInvalid || undefined} className="sm:max-w-sm">
            <FieldLabel htmlFor="type-name">Name *</FieldLabel>
            <Input id="type-name" value={v.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} aria-invalid={nameInvalid || undefined} />
            <FieldDescription>Renaming does not change incidents already reported.</FieldDescription>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {toggles.map(([key, label, hint]) => (
              <label key={key} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <Switch
                  checked={Boolean(v[key])}
                  onCheckedChange={(c) =>
                    set(
                      key === "investigationEnabled"
                        ? { investigationEnabled: c, investigationRequired: c ? v.investigationRequired : false, investigationFormId: c ? v.investigationFormId : null }
                        : key === "investigationRequired"
                          ? { investigationRequired: c, investigationEnabled: c || v.investigationEnabled }
                          : ({ [key]: c } as Partial<typeof v>),
                    )
                  }
                />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={daysInvalid || undefined}>
              <FieldLabel htmlFor="type-days">Investigation target (days)</FieldLabel>
              <Input id="type-days" type="number" min={1} max={365} step={1} value={v.targetDays} onChange={(e) => set({ targetDays: e.target.value })} aria-invalid={daysInvalid || undefined} />
              <FieldDescription>Whole days, 1–365.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="type-report">Report form</FieldLabel>
              <FormBindingSelect id="type-report" purpose="REPORT" value={v.reportFormId} onChange={(id) => set({ reportFormId: id })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="type-inv">Investigation form</FieldLabel>
              <FormBindingSelect id="type-inv" purpose="INVESTIGATION" value={v.investigationFormId} onChange={(id) => set({ investigationFormId: id })} />
            </Field>
          </div>
          <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={!dirty || daysInvalid || nameInvalid || update.isPending}>
              {update.isPending ? <Spinner /> : <Save />} Save type settings
            </Button>
          </div>
        </CardContent>
      </Card>
      <SubtypesCard type={type} />
    </div>
  );
}

function SubtypesCard({ type }: { type: IncidentTypeDto }) {
  const mutate = useSubtypeMutation(type.id);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const activeCount = type.subtypes.filter((s) => s.isActive).length;
  const run = async (input: Parameters<typeof mutate.mutateAsync>[0], success: string) => {
    try {
      await mutate.mutateAsync(input);
      toast.success(success);
      return true;
    } catch (error) {
      const b = blockersOf(error);
      toast.error(b.length ? b.join(" ") : errorMessage(error));
      return false;
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subtypes of {type.name}</CardTitle>
        <CardDescription>Older incidents keep the subtype name they were reported with. At least one subtype must stay active.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-lg border">
          {type.subtypes.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {editing?.id === s.id ? (
                <>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8" aria-label="Subtype name" />
                  <Button size="icon" variant="ghost" aria-label="Save name" onClick={async () => (await run({ subtypeId: s.id, name: editing.name }, "Subtype renamed")) && setEditing(null)}>
                    <Check />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                    <X />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1">{s.name}</span>
                  <ActiveBadge active={s.isActive} />
                  <Button size="icon" variant="ghost" aria-label={`Rename ${s.name}`} onClick={() => setEditing({ id: s.id, name: s.name })}>
                    <Pencil />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={s.isActive && activeCount <= 1}
                    title={s.isActive && activeCount <= 1 ? "Keep at least one active subtype" : undefined}
                    onClick={() => void run({ subtypeId: s.id, isActive: !s.isActive }, s.isActive ? "Subtype deactivated" : "Subtype reactivated")}
                  >
                    <Power /> {s.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim() && (await run({ name }, "Subtype added"))) setName("");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New subtype" aria-label="New subtype" />
          <Button type="submit" variant="outline" disabled={!name.trim() || mutate.isPending}>
            <Plus /> Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Values of one pick-list: add, rename, notes (destination), deactivate/reactivate. Nothing is deleted. */
function ListEditor({ listKey, title, placeholder, withNotes, notesLabel, kind }: { listKey: LookupListKey; title: string; placeholder: string; withNotes?: boolean; notesLabel?: string; kind?: ReporteeKindKey }) {
  const list = useLookup(listKey, { includeInactive: true });
  const create = useCreateLookupValue(listKey);
  const update = useUpdateLookupValue(listKey);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<{ id: string; label: string; notes: string } | null>(null);
  const guard = useUnsavedChangesGuard(Boolean(label || notes || editing));
  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  };
  return (
    <Card>
      {guard.dialog}
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {kind && <CardDescription>Choosing a reportee records intent only – nothing is sent automatically.</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {list.isPending ? (
          <LoadingRows rows={2} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {(list.data ?? []).length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Nothing yet.</li>}
            {(list.data ?? []).map((v) =>
              editing?.id === v.id ? (
                <li key={v.id} className="space-y-2 px-3 py-2">
                  <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} aria-label="Name" className="h-8" />
                  {withNotes && <Input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} aria-label={notesLabel} placeholder={notesLabel} className="h-8" />}
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={async () => (await run(() => update.mutateAsync({ id: v.id, label: editing.label, ...(withNotes ? { notes: editing.notes || null } : {}) }), "Saved")) && setEditing(null)}>
                      <Check /> Save
                    </Button>
                  </div>
                </li>
              ) : (
                <li key={v.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className={v.isActive ? "" : "text-muted-foreground line-through"}>{v.label}</span>
                    {withNotes && v.notes && <span className="block truncate text-xs text-muted-foreground">{v.notes}</span>}
                  </span>
                  <ActiveBadge active={v.isActive} />
                  <Button size="icon" variant="ghost" aria-label={`Edit ${v.label}`} onClick={() => setEditing({ id: v.id, label: v.label, notes: v.notes ?? "" })}>
                    <Pencil />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void run(() => update.mutateAsync({ id: v.id, isActive: !v.isActive }), v.isActive ? "Deactivated" : "Reactivated")}>
                    <Power /> {v.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </li>
              ),
            )}
          </ul>
        )}
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!label.trim() || (withNotes && !notes.trim())) return;
            if (await run(() => create.mutateAsync({ label, ...(withNotes ? { notes } : {}) }), "Added")) {
              setLabel("");
              setNotes("");
            }
          }}
        >
          <div className="grid gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
            {withNotes && <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={`${notesLabel} *`} aria-label={notesLabel} />}
          </div>
          <Button type="submit" variant="outline" disabled={!label.trim() || (withNotes && !notes.trim()) || create.isPending}>
            <Plus /> Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ExportColumns() {
  const setting = useSetting("incident");
  const save = useSaveSetting("incident");
  const setup = useReportSetup();
  const [columns, setColumns] = useState<string[] | null>(null);
  const current: string[] = columns ?? (setting.data as IncidentSettings | undefined)?.exportColumns ?? [];
  const guard = useUnsavedChangesGuard(columns !== null);

  const custom = useMemo(() => {
    const map = new Map<string, { label: string; exportable: boolean; forms: string[] }>();
    for (const t of setup.data ?? []) {
      for (const f of t.reportFormVersion?.fields ?? []) {
        if (f.system || !isAnswerable(f.type)) continue;
        const entry = map.get(f.key) ?? { label: f.label, exportable: f.exportable !== false, forms: [] };
        if (!entry.forms.includes(t.reportFormVersion!.name)) entry.forms.push(t.reportFormVersion!.name);
        map.set(f.key, entry);
      }
    }
    return map;
  }, [setup.data]);

  const label = (c: string) => {
    if (c in STANDARD_EXPORT_COLUMNS) return STANDARD_EXPORT_COLUMNS[c as keyof typeof STANDARD_EXPORT_COLUMNS];
    const key = c.slice(ANSWER_COLUMN_PREFIX.length);
    return `${custom.get(key)?.label ?? key} (question)`;
  };
  const available = [
    ...Object.keys(STANDARD_EXPORT_COLUMNS).map((c) => ({ value: c, label: label(c), note: "" })),
    ...[...custom.entries()].filter(([, v]) => v.exportable).map(([key, v]) => ({ value: answerColumn(key), label: `${v.label} (question)`, note: v.forms.join(", ") })),
  ].filter((o) => !current.includes(o.value));
  const move = (i: number, d: number) => {
    const next = [...current];
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item!);
    setColumns(next);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {guard.dialog}
      <Card>
        <CardHeader>
          <CardTitle>Columns in the export</CardTitle>
          <CardDescription>In this order. Questions marked “not exportable” in Form Builder are never written.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="divide-y rounded-lg border">
            {current.map((c, i) => (
              <li key={c} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="w-6 text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className="flex-1">{label(c)}</span>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Move down" disabled={i === current.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Remove" disabled={current.length <= 1} onClick={() => setColumns(current.filter((x) => x !== c))}>
                  <X />
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex justify-end gap-2">
            {columns && (
              <Button variant="ghost" onClick={() => setColumns(null)}>
                Discard
              </Button>
            )}
            <Button
              disabled={!columns || save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync({ exportColumns: current } as never);
                  setColumns(null);
                  toast.success("Export columns saved");
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              {save.isPending ? <Spinner /> : <Save />} Save columns
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add a column</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {available.map((o) => (
              <li key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  {o.label}
                  {o.note && <span className="block truncate text-xs text-muted-foreground">{o.note}</span>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setColumns([...current, o.value])}>
                  <Plus /> Add
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SiteQuestions() {
  const setup = useReportSetup();
  const [typeId, setTypeId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const type = setup.data?.find((t) => t.id === typeId) ?? setup.data?.[0];
  const fields = type?.reportFormVersion ? fieldsForSite(type.reportFormVersion.fields, siteId) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Questions people see when reporting</CardTitle>
        <CardDescription>The published report form bound to the type, as it applies at the chosen site. Change questions in Form Builder.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="sq-type">Incident type</FieldLabel>
            <SimpleSelect id="sq-type" value={type?.id ?? null} onChange={setTypeId} options={(setup.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="sq-site">Site</FieldLabel>
            <SiteSelect id="sq-site" value={siteId} onChange={setSiteId} allowNone noneLabel="Questions for every site only" />
          </Field>
        </div>
        {!type?.reportFormVersion ? (
          <p className="text-sm text-muted-foreground">No published report form is bound to this type.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {type.reportFormVersion.name} · v{type.reportFormVersion.version}
            </p>
            <ol className="divide-y rounded-lg border">
              {fields.map((f, i) => (
                <li key={f.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-6 text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span className="min-w-0 flex-1 font-medium">{f.label}</span>
                  <span className="text-xs text-muted-foreground">{FORM_FIELD_TYPE_LABELS[f.type]}</span>
                  {f.system && <StatusBadge tone="brand">Mandatory</StatusBadge>}
                  {f.required && !f.system && <StatusBadge tone="warning">Required</StatusBadge>}
                  {f.searchable && <StatusBadge tone="info">Searchable</StatusBadge>}
                  {!f.system && isAnswerable(f.type) && <StatusBadge tone={f.exportable === false ? "neutral" : "success"}>{f.exportable === false ? "Not exported" : "Exported"}</StatusBadge>}
                  {f.siteIds?.length ? <StatusBadge tone="purple">Some sites only</StatusBadge> : null}
                </li>
              ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}
