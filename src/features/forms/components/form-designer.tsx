"use client";

import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarDays,
  Eye,
  GripVertical,
  Hash,
  Heading,
  ListChecks,
  ListFilter,
  Lock,
  MapPin,
  Paperclip,
  Search,
  Send,
  ToggleLeft,
  Type,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ApiError, errorMessage } from "@/lib/api-client";
import {
  copyQuestion,
  FORM_FIELD_TYPE_LABELS,
  incidentConflicts,
  newField,
  newFieldKey,
  PALETTE,
  reuseConflict,
  type FormFieldDefinition,
  type FormFieldType,
  type IncidentPurpose,
} from "@/lib/forms";
import { cn } from "@/lib/utils";
import { usePublishForm, useReusableQuestions, useSaveFormDraft, useFormDetail, type FormDetailDto } from "../api";
import { FieldInspector } from "./field-inspector";
import { FormPreview } from "./form-preview";
import { FormStatusBadge } from "./forms-library";
import { RiskRulesPanel } from "./risk-rules-panel";

const ICONS: Partial<Record<FormFieldType, LucideIcon>> = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  date: CalendarDays,
  datetime: CalendarClock,
  select: ListFilter,
  multiselect: ListChecks,
  boolean: ToggleLeft,
  person: UserRound,
  file: Paperclip,
  heading: Heading,
  score: Hash,
};

interface DesignDraft {
  name: string;
  fields: FormFieldDefinition[];
}

interface Issue {
  path?: string;
  message: string;
  fieldKey?: string;
}

type DragPayload = { kind: "new"; type: FormFieldType } | { kind: "move"; key: string };
const DRAG_TYPE = "application/x-oleoq-question";

const WIDE_QUERY = "(min-width: 1280px)";

/** Three columns need a wide screen; below it the inspector opens in a sheet. */
function useWideLayout(): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(WIDE_QUERY);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );
}

const draftOf = (form: FormDetailDto): DesignDraft => ({ name: form.name, fields: form.fields });
const same = (a: DesignDraft, b: DesignDraft) => a.name.trim() === b.name.trim() && JSON.stringify(a.fields) === JSON.stringify(b.fields);

/** /configuration/forms/[id] – palette (left), canvas (centre), inspector (right; a Sheet on mobile). */
export function FormDesigner({ id }: { id: string }) {
  const detail = useFormDetail(id);
  if (detail.isPending) return <LoadingRows rows={10} />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  return <Designer form={detail.data} reload={() => detail.refetch().then((r) => r.data)} />;
}

function Designer({ form, reload }: { form: FormDetailDto; reload: () => Promise<FormDetailDto | undefined> }) {
  const isMobile = useIsMobile();
  const wide = useWideLayout();
  const [draft, setDraft] = useState<DesignDraft>(() => draftOf(form));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [stale, setStale] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tab, setTab] = useState<"questions" | "rules">("questions");
  const [rulesDirty, setRulesDirty] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const save = useSaveFormDraft();
  const publish = usePublishForm();
  const readOnly = !form.access.design;
  const dirty = !same(draft, draftOf(form));
  const guard = useUnsavedChangesGuard(dirty || rulesDirty);
  const busy = save.isPending || publish.isPending;

  const conflicts = useMemo(() => {
    if (form.module !== "incidents") return new Map<string, string>();
    return new Map(incidentConflicts(draft.fields, form.purpose as IncidentPurpose).map((c) => [c.key, c.message]));
  }, [draft.fields, form.module, form.purpose]);

  const selectedIndex = draft.fields.findIndex((f) => f.key === selectedKey);
  const selected = selectedIndex >= 0 ? draft.fields[selectedIndex]! : null;

  const setFields = (fields: FormFieldDefinition[]) => setDraft((d) => ({ ...d, fields }));
  const onRulesDirty = useCallback((v: boolean) => setRulesDirty(v), []);

  function addField(type: FormFieldType, index?: number) {
    if (readOnly) return;
    const field = newField(type, draft.fields.map((f) => f.key));
    const at = index ?? (selectedIndex >= 0 ? selectedIndex + 1 : draft.fields.length);
    const fields = [...draft.fields];
    fields.splice(at, 0, field);
    setFields(fields);
    setSelectedKey(field.key);
  }

  function moveField(key: string, to: number) {
    const from = draft.fields.findIndex((f) => f.key === key);
    if (from < 0) return;
    const fields = [...draft.fields];
    const [field] = fields.splice(from, 1);
    fields.splice(Math.max(0, Math.min(to > from ? to - 1 : to, fields.length)), 0, field!);
    setFields(fields);
  }

  function updateField(key: string, patch: Partial<FormFieldDefinition>) {
    setFields(draft.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function removeField(key: string) {
    const field = draft.fields.find((f) => f.key === key);
    if (!field || field.system) return;
    setFields(draft.fields.filter((f) => f.key !== key));
    setSelectedKey(null);
    toast.success(`"${field.label}" removed from the draft – Discard restores it`);
  }

  function reuse(question: FormFieldDefinition) {
    const blocked = reuseConflict({ module: form.module, purpose: form.purpose, fields: draft.fields }, question);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    const copy = copyQuestion(question, newFieldKey(draft.fields.map((f) => f.key)));
    setFields([...draft.fields, copy]);
    setSelectedKey(copy.key);
    toast.success(`"${copy.label}" added to the end of this form`);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    const index = dropIndex ?? draft.fields.length;
    setDropIndex(null);
    try {
      const payload = JSON.parse(event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData("text/plain")) as DragPayload;
      if (payload.kind === "new" && PALETTE.some((p) => p.type === payload.type)) addField(payload.type, index);
      if (payload.kind === "move") moveField(payload.key, index);
    } catch {
      // Ignore drops that did not start in the designer.
    }
  }

  function handleError(error: unknown) {
    if (isStaleVersion(error)) setStale(true);
    if (error instanceof ApiError && error.code === "VALIDATION_ERROR" && Array.isArray(error.details)) setIssues(error.details as Issue[]);
    toast.error(errorMessage(error));
  }

  async function saveDraft() {
    if (!draft.name.trim()) return toast.error("Enter a form name");
    try {
      const next = await save.mutateAsync({ id: form.id, name: draft.name.trim(), fields: draft.fields, settings: form.settings, expectedVersion: form.version });
      setDraft(draftOf(next));
      setIssues([]);
      setStale(false);
      toast.success("Draft saved");
    } catch (error) {
      handleError(error);
    }
  }

  async function publishNow() {
    if (!draft.name.trim()) return toast.error("Enter a form name");
    try {
      const next = await publish.mutateAsync({ id: form.id, name: draft.name.trim(), fields: draft.fields, settings: form.settings, expectedVersion: form.version });
      setDraft(draftOf(next));
      setIssues([]);
      setStale(false);
      toast.success(`Published as version ${next.currentVersion} – new records use it from now on`);
    } catch (error) {
      handleError(error);
    }
  }

  const banner =
    form.status === "PUBLISHED" && !dirty
      ? { title: `Published – version ${form.currentVersion} is in use`, text: "Changes you make here stay a draft until you publish them. Records already started keep the version they captured." }
      : form.currentVersion > 0
        ? { title: `Draft changes – version ${form.currentVersion} stays in use until you publish`, text: "Save to keep working later. Publish to make these changes available for new records." }
        : { title: "Draft – not used until published", text: "Nobody can choose this form yet. Save to keep working later; publish when it is ready." };

  const inspector = selected ? (
    <FieldInspector
      key={selected.key}
      field={selected}
      module={form.module}
      readOnly={readOnly}
      conflict={conflicts.get(selected.key)}
      onChange={(patch) => updateField(selected.key, patch)}
      onRemove={() => removeField(selected.key)}
    />
  ) : (
    <p className="text-sm text-muted-foreground">Select a question to change its settings.</p>
  );

  return (
    <>
      {guard.dialog}
      <PageHeader
        title={draft.name || "Untitled form"}
        backHref="/configuration/forms"
        backLabel="Form Builder"
        meta={
          <>
            <StatusBadge tone="brand">
              {form.moduleLabel} · {form.purposeLabel}
            </StatusBadge>
            <FormStatusBadge form={form} />
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye /> Preview
            </Button>
            {!readOnly && (
              <Button variant="outline" disabled={!dirty || busy || rulesDirty} onClick={() => void saveDraft()}>
                {save.isPending && <Spinner />} Save draft
              </Button>
            )}
            {form.access.publish && (
              <Button disabled={busy || rulesDirty || conflicts.size > 0 || (!dirty && form.status === "PUBLISHED")} onClick={() => void publishNow()}>
                {publish.isPending ? <Spinner /> : <Send />} Publish
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-4">
        <Alert className={cn(form.status === "PUBLISHED" && !dirty ? "border-success/40" : "border-warning/50 bg-warning/5")}>
          <AlertTitle>{banner.title}</AlertTitle>
          <AlertDescription>{banner.text}</AlertDescription>
        </Alert>
        {stale && (
          <StaleVersionAlert
            draft={draft}
            draftName="form-draft"
            onReload={() =>
              void reload().then((fresh) => {
                if (fresh) setDraft(draftOf(fresh));
                setStale(false);
              })
            }
          />
        )}
        {issues.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>Fix these before publishing</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {issues.map((i, n) => (
                  <li key={n}>
                    {i.fieldKey ? (
                      <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setSelectedKey(i.fieldKey!)}>
                        {i.message}
                      </button>
                    ) : (
                      i.message
                    )}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Card className="gap-0 py-0">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="space-y-1.5 text-sm font-medium">
              Form name *
              <Input value={draft.name} disabled={readOnly} maxLength={80} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </label>
            {form.module === "risk" && (
              <Tabs value={tab} onValueChange={(v) => setTab(v as "questions" | "rules")}>
                <TabsList className="h-9">
                  <TabsTrigger value="questions" className="px-3">
                    Questions
                  </TabsTrigger>
                  <TabsTrigger value="rules" className="px-3">
                    Scoring & review rules{rulesDirty ? " •" : ""}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {form.module === "risk" && tab === "rules" ? (
          <RiskRulesPanel
            key={form.version}
            form={form}
            blocked={dirty}
            onDirtyChange={onRulesDirty}
            onReload={() => void reload().then((fresh) => fresh && setDraft(draftOf(fresh)))}
          />
        ) : (
          <div className={cn("grid gap-4", readOnly ? "xl:grid-cols-[minmax(0,1fr)_20rem]" : "lg:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_20rem]")}>
            {!readOnly && (
              <div className="space-y-4">
                <Card className="gap-0 py-0">
                  <CardHeader className="border-b p-3">
                    <CardTitle className="text-sm">Add a question</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-1 p-2 lg:grid-cols-1">
                    {PALETTE.map((p) => {
                      const Icon = ICONS[p.type] ?? Type;
                      return (
                        <button
                          key={p.type}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            const payload = JSON.stringify({ kind: "new", type: p.type } satisfies DragPayload);
                            e.dataTransfer.setData(DRAG_TYPE, payload);
                            e.dataTransfer.setData("text/plain", payload);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => addField(p.type)}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                          title={`${p.hint} – click to add${selected ? " after the selected question" : " at the end"}, or drag onto the form`}
                        >
                          <Icon className="size-4 shrink-0 text-brand" />
                          <span className="truncate">{p.label}</span>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
                <ReusePanel formId={form.id} onPick={reuse} />
              </div>
            )}

            <Card className="min-w-0 gap-0 py-0">
              <CardHeader className="flex flex-row items-center justify-between border-b p-3">
                <CardTitle className="text-sm">Questions ({draft.fields.filter((f) => f.type !== "heading").length})</CardTitle>
                <span className="hidden text-xs text-muted-foreground sm:inline">Drag to reorder, or use the arrows</span>
              </CardHeader>
              <CardContent className="p-2">
                <ul
                  className="space-y-1"
                  onDragOver={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    if (e.target === e.currentTarget) setDropIndex(draft.fields.length);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(null);
                  }}
                  onDrop={onDrop}
                  aria-label="Form questions"
                >
                  {draft.fields.map((field, index) => {
                    const Icon = ICONS[field.type] ?? Type;
                    const conflict = conflicts.get(field.key);
                    return (
                      <li
                        key={field.key}
                        draggable={!readOnly}
                        onDragStart={(e) => {
                          const payload = JSON.stringify({ kind: "move", key: field.key } satisfies DragPayload);
                          e.dataTransfer.setData(DRAG_TYPE, payload);
                          e.dataTransfer.setData("text/plain", payload);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (readOnly) return;
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setDropIndex(e.clientY > rect.top + rect.height / 2 ? index + 1 : index);
                        }}
                        className="relative"
                      >
                        {dropIndex === index && <span className="absolute -top-1 left-0 right-0 h-0.5 rounded bg-brand" aria-hidden />}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedKey(field.key)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedKey(field.key))}
                          aria-pressed={field.key === selectedKey}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border bg-card px-2 py-2 text-left hover:border-brand/40",
                            field.key === selectedKey && "border-brand bg-brand-soft/40",
                            field.type === "heading" && "bg-muted/40",
                            conflict && "border-destructive/60",
                          )}
                        >
                          {!readOnly && <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />}
                          <Icon className="size-4 shrink-0 text-brand" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-sm", field.type === "heading" ? "font-semibold" : "font-medium")}>
                              {field.label || "Untitled"}
                              {field.required && field.type !== "score" ? <span className="text-destructive"> *</span> : null}
                            </span>
                            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                              {FORM_FIELD_TYPE_LABELS[field.type]}
                              {field.system && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Lock className="size-3" /> Required by {form.moduleLabel}
                                </span>
                              )}
                              {field.siteIds?.length ? (
                                <span className="inline-flex items-center gap-0.5">
                                  <MapPin className="size-3" /> {field.siteIds.length} site{field.siteIds.length === 1 ? "" : "s"}
                                </span>
                              ) : null}
                              {field.searchable && <span>Searchable</span>}
                            </span>
                            {conflict && <span className="mt-0.5 block text-xs font-medium text-destructive">{conflict}</span>}
                          </span>
                          {!readOnly && (
                            <span className="flex shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Move ${field.label} up`} disabled={index === 0} onClick={() => moveField(field.key, index - 1)}>
                                <ArrowUp />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                aria-label={`Move ${field.label} down`}
                                disabled={index === draft.fields.length - 1}
                                onClick={() => moveField(field.key, index + 2)}
                              >
                                <ArrowDown />
                              </Button>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {dropIndex === draft.fields.length && <li className="h-0.5 rounded bg-brand" aria-hidden />}
                  {!readOnly && <li className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Drop a component here to add it at the end</li>}
                </ul>
              </CardContent>
            </Card>

            {wide && (
              <Card className="h-fit gap-0 py-0 xl:sticky xl:top-20">
                <CardHeader className="border-b p-3">
                  <CardTitle className="text-sm">Question settings</CardTitle>
                </CardHeader>
                <CardContent className="p-3">{inspector}</CardContent>
              </Card>
            )}
          </div>
        )}

        {dirty && !readOnly && (
          <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-lg md:bottom-4 assistant:mr-15">
            <span className="text-sm font-medium">Unsaved changes</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDraft(draftOf(form));
                  setIssues([]);
                  setStale(false);
                }}
              >
                Discard
              </Button>
              <Button disabled={busy || rulesDirty} onClick={() => void saveDraft()}>
                {save.isPending && <Spinner />} Save draft
              </Button>
            </div>
          </div>
        )}
      </div>

      {!wide && (
        <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedKey(null)}>
          <SheetContent side={isMobile ? "bottom" : "right"} className={cn("overflow-y-auto", isMobile ? "max-h-[85dvh]" : "w-full sm:max-w-md")}>
            <SheetHeader>
              <SheetTitle>Question settings</SheetTitle>
              <SheetDescription>Changes are part of the draft until you save.</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">{inspector}</div>
          </SheetContent>
        </Sheet>
      )}

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{draft.name || "Untitled form"}</SheetTitle>
            <SheetDescription>
              {form.moduleLabel} · {form.purposeLabel} – how the questions will look.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <FormPreview fields={draft.fields} idPrefix="designer-preview" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ReusePanel({ formId, onPick }: { formId: string; onPick: (field: FormFieldDefinition) => void }) {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const results = useReusableQuestions(q, formId);
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b p-3">
        <CardTitle className="text-sm">Reuse a question</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search other forms" className="pl-8" aria-label="Search questions in other forms" />
        </div>
        {q && results.isFetching && !results.data && <Spinner className="mx-auto" />}
        {q && results.data?.length === 0 && <p className="px-1 text-xs text-muted-foreground">No custom questions match.</p>}
        <ul className="space-y-1">
          {results.data?.map((r, i) => (
            <li key={`${r.formId}-${r.field.key}-${i}`}>
              <button type="button" className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => onPick(r.field)} title="Adds an independent copy at the end of this form">
                <span className="block truncate text-sm font-medium">{r.field.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {FORM_FIELD_TYPE_LABELS[r.field.type]} · {r.formName} ({r.moduleLabel})
                </span>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
