"use client";

import { ChevronDown, Save, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { StatusBadge } from "@/components/common/status-badge";
import { UserPicker } from "@/components/common/user-picker";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { usePublishedForms, useQuestionnaireSnapshot } from "@/features/forms/api";
import { QuestionnaireForm } from "@/features/forms/components/questionnaire-form";
import { BlockerList } from "@/features/incidents/components/shared";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { validateQuestionnaireAnswers, type FormValues } from "@/lib/forms";
import { EVALUATION_STATUS_LABELS, LAW_FORM_MODULE, LAW_FORM_PURPOSE } from "@/lib/law";
import { ApiError, errorMessage } from "@/lib/api-client";
import { evaluationSaveBlockers, evaluationStatus, isEvaluationComplete, missingForComplete } from "@/server/modules/law/workflow";
import { useSaveEvaluation, type LawRequirementDetailDto } from "../../api";
import { addDaysLocal, blockersOf, EVALUATION_STATUS_TONES, todayLocal } from "../../format";
import { SiteDepartmentSelect, useDefaultDepartment } from "./requirement-dialogs";

interface Values {
  relevanceNotes: string;
  evaluationNotes: string;
  ownerId: string | null;
  departmentId: string | null;
  nextReviewDate: string;
  rating: string;
  confirmReviewed: boolean;
  answers: FormValues;
}

function fieldErrorsOf(error: unknown): Record<string, string> {
  const details = error instanceof ApiError ? (error.details as { fieldErrors?: Record<string, string> } | undefined) : undefined;
  return details && typeof details === "object" && details.fieldErrors ? details.fieldErrors : {};
}

/** "Check compliance": why it applies, how we checked, who, where and when to look again. */
export function EvaluationSheet({ requirement, open, onOpenChange }: { requirement: LawRequirementDetailDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">{open && <EvaluationForm requirement={requirement} onDone={() => onOpenChange(false)} />}</SheetContent>
    </Sheet>
  );
}

function EvaluationForm({ requirement: r, onDone }: { requirement: LawRequirementDetailDto; onDone: () => void }) {
  const { user } = useCurrentUser();
  const defaultDepartment = useDefaultDepartment(r.siteId);
  const [start] = useState<Values>(() => ({
    relevanceNotes: r.relevanceNotes,
    evaluationNotes: r.evaluationNotes,
    // Sensible starting points: the person checking, their department, a yearly review.
    ownerId: r.ownerId ?? user?.id ?? null,
    departmentId: r.departmentId ?? defaultDepartment,
    nextReviewDate: r.nextReviewDate ?? addDaysLocal(todayLocal(), 365),
    rating: r.rating === null ? "" : String(r.rating),
    confirmReviewed: false,
    answers: r.answers,
  }));
  const [v, setV] = useState<Values>(start);
  const [showErrors, setShowErrors] = useState(false);
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});
  const [blockers, setBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const save = useSaveEvaluation(r.id);
  const guard = useUnsavedChangesGuard(JSON.stringify(v) !== JSON.stringify(start));
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));

  // Extra questions: the captured form, or the latest published Law form for the site.
  const forms = usePublishedForms(LAW_FORM_MODULE, LAW_FORM_PURPOSE, r.siteId ?? undefined);
  const versionId = r.form ? null : (forms.data?.[0]?.versionId ?? null);
  const fresh = useQuestionnaireSnapshot(versionId, r.siteId);
  const snapshot = r.form ?? fresh.data ?? null;

  const rating = v.rating.trim() === "" ? null : Number(v.rating);
  const input = { ...v, rating, nextReviewDate: v.nextReviewDate || null };
  const gates = evaluationSaveBlockers(input, { isRelevant: r.isRelevant, reviewRequired: r.reviewRequired, today: todayLocal(), currentNextReviewDate: r.nextReviewDate });
  const complete = isEvaluationComplete(input);
  const willClear = r.reviewRequired && v.confirmReviewed && complete;
  const preview = evaluationStatus({ ...input, isRelevant: true, reviewRequired: r.reviewRequired && !willClear });
  const missing = missingForComplete(input);

  async function submit() {
    setBlockers([]);
    const answersCheck = snapshot ? validateQuestionnaireAnswers(snapshot, v.answers, { mode: complete ? "submit" : "draft" }) : null;
    setAnswerErrors(answersCheck?.errors ?? {});
    if (gates.length || (answersCheck && !answersCheck.valid)) {
      setShowErrors(true);
      toast.error(gates[0] ?? "Answer the extra questions.");
      return;
    }
    try {
      const res = await save.mutateAsync({
        relevanceNotes: v.relevanceNotes.trim(),
        evaluationNotes: v.evaluationNotes.trim(),
        rating,
        ownerId: v.ownerId,
        departmentId: v.departmentId,
        nextReviewDate: v.nextReviewDate || null,
        confirmReviewed: v.confirmReviewed,
        formVersionId: r.form ? null : (snapshot ? versionId : null),
        answers: snapshot ? (answersCheck?.data ?? v.answers) : {},
        expectedVersion: r.version,
      });
      toast.success(res.reviewConfirmed ? "Review confirmed – the requirement is checked again" : res.complete ? "Saved – the requirement is checked" : "Saved – the check is not complete yet");
      onDone();
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      setBlockers(blockersOf(error));
      setAnswerErrors(fieldErrorsOf(error));
      toast.error(errorMessage(error), { action: { label: "Retry", onClick: () => void submit() } });
    }
  }

  return (
    <>
      {guard.dialog}
      <SheetHeader>
        <SheetTitle>Check compliance</SheetTitle>
        <SheetDescription>
          {r.reference} · {r.title}. You can save part of the check now and finish it later.
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4 pb-4">
        {stale && <StaleVersionAlert draft={v} draftName="check" onReload={() => window.location.reload()} />}
        {r.reviewRequired && (
          <Alert className="border-warning/50 bg-warning/10">
            <TriangleAlert className="text-[#9a5b00]" />
            <AlertTitle>The law changed</AlertTitle>
            <AlertDescription>{r.reviewReason ?? "Review your controls and evidence against the changed requirement, then confirm below."}</AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="ev-relevance">1. Why does it apply here, and what controls are in place?</FieldLabel>
          <Textarea id="ev-relevance" rows={4} value={v.relevanceNotes} onChange={(e) => set({ relevanceNotes: e.target.value })} placeholder="Where it applies, the controls you have (procedures, equipment, training) and who maintains them." />
        </Field>
        <Field>
          <FieldLabel htmlFor="ev-evaluation">2. How did you check it?</FieldLabel>
          <Textarea id="ev-evaluation" rows={4} value={v.evaluationNotes} onChange={(e) => set({ evaluationNotes: e.target.value })} placeholder="The evidence you looked at (records, inspections, permits), what you found and any gaps that remain." />
          <FieldDescription>Add files and links on the Evidence tab.</FieldDescription>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ev-owner">3. Who is responsible?</FieldLabel>
            <UserPicker id="ev-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} placeholder="Choose a person" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ev-dept">Department</FieldLabel>
            <SiteDepartmentSelect id="ev-dept" siteId={r.siteId} value={v.departmentId} onChange={(id) => set({ departmentId: id })} />
          </Field>
        </div>
        <Field data-invalid={(showErrors && gates.some((g) => g.includes("review date"))) || undefined}>
          <FieldLabel htmlFor="ev-review">4. When should it be checked again?</FieldLabel>
          <Input id="ev-review" type="date" className="sm:w-56" value={v.nextReviewDate} onChange={(e) => set({ nextReviewDate: e.target.value })} />
          {showErrors && gates.filter((g) => g.includes("review date")).map((g) => <FieldError key={g}>{g}</FieldError>)}
          <FieldDescription>The responsible person is reminded when the date comes.</FieldDescription>
        </Field>

        <Collapsible defaultOpen={r.rating !== null}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-fit px-0">
              <ChevronDown /> Self-assessed compliance rating (optional)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Field data-invalid={(showErrors && gates.some((g) => g.includes("rating"))) || undefined}>
              <FieldLabel htmlFor="ev-rating">How well do you think you comply? (0–100 %)</FieldLabel>
              <Input id="ev-rating" type="number" inputMode="numeric" min={0} max={100} step={1} className="sm:w-40" value={v.rating} onChange={(e) => set({ rating: e.target.value })} placeholder="Not rated" />
              {showErrors && gates.filter((g) => g.includes("rating")).map((g) => <FieldError key={g}>{g}</FieldError>)}
              <FieldDescription>Your own judgement, separate from the check. Leave it empty if you are not sure. Below 50 % is low, 80 % and above is good.</FieldDescription>
            </Field>
          </CollapsibleContent>
        </Collapsible>

        {snapshot && snapshot.fields.length > 0 && (
          <section className="space-y-3 rounded-xl border p-4">
            <div>
              <h3 className="text-sm font-semibold">More questions</h3>
              <p className="text-xs text-muted-foreground">
                {snapshot.name} · version {snapshot.version}
                {complete ? " – required questions must be answered to complete the check." : ""}
              </p>
            </div>
            <QuestionnaireForm snapshot={snapshot} value={v.answers} onChange={(answers) => set({ answers })} errors={showErrors ? answerErrors : undefined} idPrefix="evq" />
          </section>
        )}

        {r.reviewRequired && r.permissions.confirmReview && (
          <Label className="flex items-start gap-3 rounded-xl border border-warning/50 bg-warning/5 p-3 text-sm font-normal">
            <Checkbox className="mt-0.5" checked={v.confirmReviewed} onCheckedChange={(c) => set({ confirmReviewed: c === true })} />
            <span>
              <span className="font-medium">I have reviewed our controls and evidence against the changed requirement.</span>
              <span className="block text-xs text-muted-foreground">This clears “Law changed – review”. All four parts above must be filled in.</span>
            </span>
          </Label>
        )}

        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            Will be saved as <StatusBadge tone={EVALUATION_STATUS_TONES[preview]} dot>{EVALUATION_STATUS_LABELS[preview]}</StatusBadge>
          </p>
          {missing.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {r.reviewRequired && !willClear && complete && <p className="mt-2 text-xs text-muted-foreground">Tick the confirmation above to clear the review.</p>}
        </div>

        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => guard.confirm(onDone)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending ? <Spinner /> : <Save />} Save
          </Button>
        </div>
      </div>
    </>
  );
}
