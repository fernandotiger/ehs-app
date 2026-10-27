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
 * Edit survey: everything is editable until the first answer. Afterwards the questions lock (with
 * an explanation) and "Replace survey" starts a new survey while the old one and its answers are
 * kept under Previous surveys.
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
      toast.success(`Survey saved${notifiedText(res.notified)}.`);
      setShowErrors(false);
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
    }
  }

  async function replaceSurvey() {
    try {
      const res = await replace.mutateAsync({ survey: draftToInput(draft), expectedVersion: survey.version });
      toast.success(`New survey started – the previous one is kept under Previous surveys${notifiedText(res.notified)}.`);
      onDone();
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      {guard.dialog}
      {stale && <StaleVersionAlert draft={draftToInput(draft)} draftName="survey" onReload={onReload} />}

      {mode === "edit" && survey.questionsLocked && (
        <Alert className="border-warning/40 bg-warning/10">
          <Lock />
          <AlertTitle>The questions are locked</AlertTitle>
          <AlertDescription>
            <p>
              {answersLabel(survey.responseCount)} have already been given, so changing the questions would mix up the results. You can still change the title,
              introduction, “Everyone must answer”, the deadline, and switch anonymous answers on.
            </p>
            <p className="mt-1">To ask different questions, replace the survey – the current survey and its answers are kept under Previous surveys.</p>
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
              <Replace /> Replace survey
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {mode === "replace" && (
        <Alert className="border-brand/30 bg-brand-soft/60">
          <Replace />
          <AlertTitle>New survey</AlertTitle>
          <AlertDescription>
            <p>Change the questions as you like. When you press “Replace survey”, the current survey closes for good, its answers stay readable under Previous surveys, and everyone can answer the new one.</p>
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
              <Undo2 /> Keep the current survey
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
        {dirty && <span className="mr-auto text-xs text-muted-foreground">{mode === "replace" ? "New survey not saved yet" : "Unsaved changes"}</span>}
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
                {replace.isPending ? <Spinner /> : <Replace />} Replace survey
              </Button>
            }
            title="Replace the survey?"
            description={`The current survey and its ${answersLabel(survey.responseCount)} are kept read-only under Previous surveys. ${
              doc.status === "PUBLISHED" ? "Everyone in the audience is told about the new survey and can answer it." : "The new survey goes live when the document is published."
            }`}
            confirmLabel="Replace survey"
            onConfirm={() => (valid() ? replaceSurvey() : undefined)}
          />
        )}
      </div>
    </div>
  );
}
