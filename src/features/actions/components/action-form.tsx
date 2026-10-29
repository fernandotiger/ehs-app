"use client";

import { ChevronDown, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { LoadingCards } from "@/components/common/states";
import { UserPicker } from "@/components/common/user-picker";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useFavouriteSeed } from "@/features/favourites/api";
import { FavouriteSeedBanner } from "@/features/favourites/components/seed-banner";
import { useFavouriteCapture } from "@/features/favourites/use-favourite-capture";
import { usePublishedForms, useQuestionnaireSnapshot } from "@/features/forms/api";
import { QuestionnaireForm } from "@/features/forms/components/questionnaire-form";
import { BlockerList } from "@/features/incidents/components/shared";
import { DepartmentSelect, enumOptions, SimpleSelect } from "@/features/incidents/components/fields";
import { useLookups } from "@/features/shared/lookups";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ACTION_FORM_MODULE, ACTION_FORM_PURPOSE, ACTION_PRIORITIES, ACTION_PRIORITY_LABELS, type ActionPriorityKey } from "@/lib/actions";
import { ApiError, errorMessage } from "@/lib/api-client";
import type { Snapshot } from "@/lib/favourites/snapshot";
import { validateQuestionnaireAnswers, type FormValues, type QuestionnaireSnapshot } from "@/lib/forms";
import { saveBlockers } from "@/server/modules/actions/workflow";
import { useCreateAction, useUpdateAction, type ActionDetailDto } from "../api";
import { addDaysLocal, blockersOf, todayLocal } from "../format";
import { mergeAction, pickAction } from "./action-seed";

interface Values {
  title: string;
  description: string;
  ownerId: string | null;
  dueDate: string;
  priority: ActionPriorityKey;
  departmentId: string | null;
  answers: FormValues;
}

export type ActionFormValues = Values;

function fieldErrorsOf(error: unknown): Record<string, string> {
  const details = error instanceof ApiError ? (error.details as { fieldErrors?: Record<string, string> } | undefined) : undefined;
  return details && typeof details === "object" && details.fieldErrors ? details.fieldErrors : {};
}

/** Title, description, who, when, priority and where – shared by Create Action and the edit sheet. */
function StandardFields({ v, set, showErrors, errors, autoFocus }: { v: Values; set: (patch: Partial<Values>) => void; showErrors: boolean; errors: { title?: string; owner?: string; due?: string }; autoFocus?: boolean }) {
  return (
    <>
      <Field data-invalid={(showErrors && errors.title) || undefined}>
        <FieldLabel htmlFor="ac-title">What needs to be done? *</FieldLabel>
        <Input id="ac-title" value={v.title} maxLength={200} autoFocus={autoFocus} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Replace the broken step on the loading bay ladder" />
        {showErrors && errors.title && <FieldError>{errors.title}</FieldError>}
      </Field>
      <Field>
        <FieldLabel htmlFor="ac-desc">Details</FieldLabel>
        <Textarea id="ac-desc" rows={3} value={v.description} onChange={(e) => set({ description: e.target.value })} placeholder="Anything that helps the person get it done (optional)" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={(showErrors && errors.owner) || undefined}>
          <FieldLabel htmlFor="ac-owner">Who will do it? *</FieldLabel>
          <UserPicker id="ac-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} placeholder="Choose a person" allowClear={false} />
          {showErrors && errors.owner && <FieldError>{errors.owner}</FieldError>}
        </Field>
        <Field data-invalid={(showErrors && errors.due) || undefined}>
          <FieldLabel htmlFor="ac-due">Due date *</FieldLabel>
          <Input id="ac-due" type="date" value={v.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          {showErrors && errors.due && <FieldError>{errors.due}</FieldError>}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ac-priority">Priority</FieldLabel>
          <SimpleSelect id="ac-priority" value={v.priority} onChange={(x) => set({ priority: (x ?? "NORMAL") as ActionPriorityKey })} options={enumOptions(ACTION_PRIORITIES, ACTION_PRIORITY_LABELS)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ac-dept">Where</FieldLabel>
          <DepartmentSelect id="ac-dept" value={v.departmentId} onChange={(x) => set({ departmentId: x })} allowNone noneLabel="Whole company" />
          <FieldDescription>Managers of this area can follow it up.</FieldDescription>
        </Field>
      </div>
    </>
  );
}

function standardErrors(v: Values, edit?: { createdOn: string; currentDueDate: string }) {
  const lines = saveBlockers({ title: v.title, ownerId: v.ownerId, dueDate: v.dueDate || null, today: todayLocal(), ...(edit ?? {}) });
  return {
    lines,
    title: lines.find((l) => l.includes("title")),
    owner: lines.find((l) => l.includes("who will do it")),
    due: lines.find((l) => l.includes("due date")),
  };
}

// ── Create Action page ──────────────────────────────────────────────────────

/**
 * Create Action: the standard fields plus the extra questions of a published Actions form (if any).
 * Opened from a favourite (`?fav=`), it starts from the values kept with it (action-seed.ts).
 */
export function CreateActionForm() {
  const seed = useFavouriteSeed("action.create");
  const lookups = useLookups();
  if (seed.status === "loading" || (seed.seed && lookups.isPending)) return <LoadingCards count={2} />;
  return <CreateActionFormBody key={seed.favId ?? "new"} seed={seed.seed} departmentIds={lookups.data?.departments.map((d) => d.id)} />;
}

function CreateActionFormBody({ seed, departmentIds }: { seed: Snapshot | null; departmentIds?: readonly string[] }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const lookups = useLookups();
  const [clientId] = useState(() => crypto.randomUUID());
  // A favourite's kept values are merged here, once, so the restored form is not "dirty".
  const [setup] = useState(() => {
    const fresh: Values = {
      title: "",
      description: "",
      ownerId: user?.id ?? null,
      dueDate: addDaysLocal(todayLocal(), 14),
      priority: "NORMAL",
      departmentId: user?.departmentId ?? null,
      answers: {},
    };
    if (!seed) return { fresh, start: fresh, form: null };
    const merged = mergeAction(fresh, seed, { departmentIds });
    return { fresh, start: merged.values, form: merged.form };
  });
  const start = setup.start;
  const [v, setV] = useState<Values>(start);
  const [chosenForm, setChosenForm] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});
  const [blockers, setBlockers] = useState<string[]>([]);
  const create = useCreateAction();
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const dirty = JSON.stringify(v) !== JSON.stringify(start);
  const guard = useUnsavedChangesGuard(dirty && !create.isSuccess);

  const siteId = lookups.data?.departments.find((d) => d.id === v.departmentId)?.siteId;
  const forms = usePublishedForms(ACTION_FORM_MODULE, ACTION_FORM_PURPOSE, siteId);
  // A favourite's "Type of action": the same version, else the same form's current version.
  const seededForm =
    chosenForm === null && setup.form ? (forms.data?.find((f) => f.versionId === setup.form?.versionId) ?? forms.data?.find((f) => f.formId === setup.form?.formId)) : undefined;
  const versionId = forms.data?.length ? (forms.data.find((f) => f.versionId === chosenForm)?.versionId ?? seededForm?.versionId ?? forms.data[0]!.versionId) : null;
  const snapshot = useQuestionnaireSnapshot(versionId, siteId ?? null);
  const errors = standardErrors(v);

  // Favourites star: keeps the fields and the text / choice answers (never the due date or files).
  useFavouriteCapture("action.create", () =>
    pickAction(
      v,
      setup.fresh,
      snapshot.data ? { formId: snapshot.data.formId, versionId: snapshot.data.versionId, fields: snapshot.data.fields, chosen: chosenForm !== null || Boolean(seededForm) } : null,
    ),
  );

  async function save() {
    setBlockers([]);
    const answersCheck = snapshot.data ? validateQuestionnaireAnswers(snapshot.data, v.answers, { mode: "submit" }) : null;
    setAnswerErrors(answersCheck?.errors ?? {});
    if (errors.lines.length || (answersCheck && !answersCheck.valid)) {
      setShowErrors(true);
      toast.error(errors.lines[0] ?? "Answer the required questions.");
      return;
    }
    try {
      const res = await create.mutateAsync({
        clientId,
        title: v.title.trim(),
        description: v.description.trim(),
        ownerId: v.ownerId,
        dueDate: v.dueDate,
        priority: v.priority,
        departmentId: v.departmentId,
        formVersionId: snapshot.data ? versionId : null,
        answers: snapshot.data ? (answersCheck?.data ?? v.answers) : {},
      });
      toast.success(`Action ${res.reference} created`);
      router.push(`/actions/${res.id}`);
    } catch (error) {
      setBlockers(blockersOf(error));
      setAnswerErrors(fieldErrorsOf(error));
      toast.error(errorMessage(error), { action: { label: "Retry", onClick: () => void save() } });
    }
  }

  return (
    <>
      {guard.dialog}
      <PageHeader title="Create action" description="Give someone a job to do that is not part of an incident or a risk assessment." backHref="/actions" backLabel="My Actions" />
      <div className="mx-auto max-w-3xl space-y-4">
        {seed && <FavouriteSeedBanner sendLabel="Create action" className="mb-0" />}
        <Card>
          <CardHeader>
            <CardTitle>The action</CardTitle>
            <CardDescription>Fields marked * are required. The person you choose gets a notification.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StandardFields v={v} set={set} showErrors={showErrors} errors={errors} autoFocus />
          </CardContent>
        </Card>
        {forms.data && forms.data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>More details</CardTitle>
              <CardDescription>Questions your company asks for every action.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {forms.data.length > 1 && (
                <Field>
                  <FieldLabel htmlFor="ac-form">Type of action</FieldLabel>
                  <SimpleSelect
                    id="ac-form"
                    value={versionId}
                    onChange={(x) => {
                      setChosenForm(x);
                      set({ answers: {} });
                      setAnswerErrors({});
                    }}
                    options={forms.data.map((f) => ({ value: f.versionId, label: f.name }))}
                  />
                </Field>
              )}
              {snapshot.isPending ? <Spinner /> : snapshot.data ? <QuestionnaireForm snapshot={snapshot.data} value={v.answers} onChange={(answers) => set({ answers })} errors={showErrors ? answerErrors : undefined} idPrefix="acq" /> : null}
            </CardContent>
          </Card>
        )}
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="outline">
            <Link href="/actions">Cancel</Link>
          </Button>
          <Button type="button" onClick={() => void save()} disabled={create.isPending || create.isSuccess}>
            {create.isPending ? <Spinner /> : <Plus />} Create action
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Edit sheet ──────────────────────────────────────────────────────────────

export function EditActionSheet({ action, open, onOpenChange }: { action: ActionDetailDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{open && <EditActionForm action={action} onDone={() => onOpenChange(false)} />}</SheetContent>
    </Sheet>
  );
}

function EditActionForm({ action, onDone }: { action: ActionDetailDto; onDone: () => void }) {
  const [start] = useState<Values>(() => ({
    title: action.title,
    description: action.description,
    ownerId: action.owner.id,
    dueDate: action.dueDate,
    priority: action.priority,
    departmentId: action.placement.departmentId,
    answers: action.answers,
  }));
  const [v, setV] = useState<Values>(start);
  const [showErrors, setShowErrors] = useState(false);
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});
  const [blockers, setBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const update = useUpdateAction(action.id);
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const guard = useUnsavedChangesGuard(JSON.stringify(v) !== JSON.stringify(start));
  const errors = standardErrors(v, { createdOn: action.createdOn, currentDueDate: action.dueDate });
  const snapshot: QuestionnaireSnapshot | null = action.form;

  async function save() {
    setBlockers([]);
    const answersCheck = snapshot ? validateQuestionnaireAnswers(snapshot, v.answers, { mode: "submit" }) : null;
    setAnswerErrors(answersCheck?.errors ?? {});
    if (errors.lines.length || (answersCheck && !answersCheck.valid)) {
      setShowErrors(true);
      toast.error(errors.lines[0] ?? "Answer the required questions.");
      return;
    }
    try {
      await update.mutateAsync({
        title: v.title.trim(),
        description: v.description.trim(),
        ownerId: v.ownerId,
        dueDate: v.dueDate,
        priority: v.priority,
        departmentId: v.departmentId,
        answers: answersCheck?.data ?? {},
        expectedVersion: action.version,
      });
      toast.success("Action saved");
      onDone();
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      setBlockers(blockersOf(error));
      setAnswerErrors(fieldErrorsOf(error));
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      {guard.dialog}
      <SheetHeader>
        <SheetTitle>Edit {action.reference}</SheetTitle>
        <SheetDescription>Changing who does it sends them a notification.</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        {stale && <StaleVersionAlert draft={v} draftName="action" onReload={() => window.location.reload()} />}
        <StandardFields v={v} set={set} showErrors={showErrors} errors={errors} />
        {snapshot && snapshot.fields.length > 0 && (
          <Collapsible defaultOpen>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-fit px-0">
                <ChevronDown /> More details ({snapshot.name})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              <QuestionnaireForm snapshot={snapshot} value={v.answers} onChange={(answers) => set({ answers })} errors={showErrors ? answerErrors : undefined} idPrefix="ace" />
            </CollapsibleContent>
          </Collapsible>
        )}
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => guard.confirm(onDone)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={update.isPending}>
            {update.isPending ? <Spinner /> : <Save />} Save
          </Button>
        </div>
      </div>
    </>
  );
}
