"use client";

import { Lock, Replace, RotateCcw, Save, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import type { ManageDocumentDto } from "@/server/modules/documents/document.dto";
import { useReplaceSurvey, useSaveSurvey, type SurveyDto } from "../../survey-api";
import { draftFromSurvey, draftsEqual, draftToInput, validateDraft, type SurveyDraft, type SurveyDraftUpdater } from "../../survey-format";
import { answersLabel } from "./survey-indicator";
import { SurveyBuilder } from "./survey-builder";

function notifiedText(notified: number): string {
  return notified ? ` – ${notified.toLocaleString()} ${notified === 1 ? "person" : "people"} notified` : "";
}

/**
 * Edit induction: everything is editable until the first answer. Afterwards the questions lock (with
 * an explanation) and "Replace induction" starts a new survey while the old one and its answers are
 * kept under Previous inductions.
 */
export function SurveyEditView({ doc, survey, onDone, onReload }: { doc: ManageDocumentDto; survey: SurveyDto; onDone: () => void; onReload: () => void }) {
  const original = useMemo(() => draftFromSurvey(survey), [survey]);
  const [draft, setDraft] = useState<SurveyDraft>(original);
  const [mode, setMode] = useState<"edit" | "replace">("edit");
  const [showErrors, setShowErrors] = useState(false);
  const [stale, setStale] = useState(false);
  const save = useSaveSurvey(doc.id);
  const replace = useReplaceSurvey(doc.id);
  const busy = save.isPending || replace.isPending;
  const dirty = mode === "replace" || !draftsEqual(draft, original);
  const guard = useUnsavedChangesGuard(dirty);
  const errors = showErrors ? validateDraft(draft) : {};
  const update: SurveyDraftUpdater = (change) => setDraft((d) => change(d));
  const locked = mode === "edit" && survey.questionsLocked;

  function valid(): boolean {
    if (Object.keys(validateDraft(draft)).length) {
      setShowErrors(true);
      toast.error("Please check the highlighted fields.");
      return false;
    }
    return true;
  }

  async function saveChanges() {
    if (!valid()) return;
    try {
      const res = await save.mutateAsync({ survey: draftToInput(draft), expectedVersion: survey.version });
      toast.success(`Induction saved${notifiedText(res.notified)}.`);
      setShowErrors(false);
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
    }
  }

  async function replaceSurvey() {
    try {
      const res = await replace.mutateAsync({ survey: draftToInput(draft), expectedVersion: survey.version });
      toast.success(`New induction started – the previous one is kept under Previous inductions${notifiedText(res.notified)}.`);
      onDone();
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      {guard.dialog}
      {stale && <StaleVersionAlert draft={draftToInput(draft)} draftName="induction" onReload={onReload} />}

      {mode === "edit" && survey.questionsLocked && (
        <Alert className="border-warning/40 bg-warning/10">
          <Lock />
          <AlertTitle>The questions are locked</AlertTitle>
          <AlertDescription>
            <p>
              {answersLabel(survey.responseCount)} have already been given, so changing the questions would mix up the results. You can still change the title,
              introduction, “Everyone must complete it”, the deadline, and switch anonymous answers on.
            </p>
            <p className="mt-1">To ask different questions, replace the induction – the current one and its answers are kept under Previous inductions.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 bg-card"
              disabled={busy}
              onClick={() => {
                setMode("replace");
                setShowErrors(false);
              }}
            >
              <Replace /> Replace induction
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {mode === "replace" && (
        <Alert className="border-brand/30 bg-brand-soft/60">
          <Replace />
          <AlertTitle>New induction</AlertTitle>
          <AlertDescription>
            <p>Change the questions as you like. When you press “Replace induction”, the current one closes for good, its answers stay readable under Previous inductions, and everyone can complete the new one.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 bg-card"
              disabled={busy}
              onClick={() => {
                setMode("edit");
                setDraft(original);
                setShowErrors(false);
              }}
            >
              <Undo2 /> Keep the current induction
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <SurveyBuilder
            key={mode}
            draft={draft}
            onChange={update}
            errors={errors}
            questionsLocked={locked}
            anonymityLocked={mode === "edit" && survey.anonymityLocked}
            idPrefix={`edit-survey-${mode}`}
          />
        </CardContent>
      </Card>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur md:bottom-4">
        {dirty && <span className="mr-auto text-xs text-muted-foreground">{mode === "replace" ? "New induction not saved yet" : "Unsaved changes"}</span>}
        {mode === "edit" ? (
          <>
            <Button type="button" variant="ghost" disabled={!dirty || busy} onClick={() => setDraft(original)}>
              <RotateCcw /> Discard
            </Button>
            <Button type="button" size="lg" disabled={!dirty || busy} onClick={() => void saveChanges()}>
              {save.isPending ? <Spinner /> : <Save />} Save changes
            </Button>
          </>
        ) : (
          <ConfirmDialog
            trigger={
              <Button type="button" size="lg" disabled={busy}>
                {replace.isPending ? <Spinner /> : <Replace />} Replace induction
              </Button>
            }
            title="Replace the induction?"
            description={`The current induction and its ${answersLabel(survey.responseCount)} are kept read-only under Previous inductions. ${
              doc.status === "PUBLISHED" ? "Everyone in the audience is told about the new induction and can complete it." : "The new induction goes live when it is published."
            }`}
            confirmLabel="Replace induction"
            onConfirm={() => (valid() ? replaceSurvey() : undefined)}
          />
        )}
      </div>
    </div>
  );
}
