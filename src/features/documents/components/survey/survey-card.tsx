"use client";

import { CheckCircle2, ClipboardList, CloudOff, Info, Lock, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ApiError, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { DocumentViewerDto } from "@/server/modules/documents/document.dto";
import { estimatedMinutes } from "@/server/modules/documents/survey-rules";
import { formatDate } from "../../format";
import { useAnswerSurvey, useMySurvey, usePendingSurveyAnswers, type MySurveyDto } from "../../survey-api";
import { ANONYMOUS_EXPLANATION, minutesLabel, questionsLabel } from "../../survey-format";
import { answerErrors, answersPayload, SurveyQuestionsForm, type AnswerValues } from "./survey-questions-form";

/** "Required · complete by 12 Mar 2026" / "Overdue – was due 12 Mar 2026" / "Optional". */
function dueLine(survey: MySurveyDto): { text: string; overdue: boolean } {
  if (!survey.isMandatory) return { text: "Optional", overdue: false };
  if (survey.myStatus === "OVERDUE") return { text: `Overdue – was due ${formatDate(survey.dueAt)}`, overdue: true };
  return { text: survey.dueAt ? `Required · complete by ${formatDate(survey.dueAt)}` : "Required", overdue: false };
}

function AnswerSheet({
  doc,
  survey,
  open,
  onOpenChange,
}: {
  doc: DocumentViewerDto;
  survey: MySurveyDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [values, setValues] = useState<AnswerValues>({});
  const [anonymous, setAnonymous] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const answer = useAnswerSurvey(doc);
  const dirty = open && (Object.values(values).some((v) => (v.text ?? "").trim() || (v.choices ?? []).length) || anonymous);
  const guard = useUnsavedChangesGuard(dirty, "Your answers have not been sent. Close and discard them?");

  const reset = () => {
    setValues({});
    setAnonymous(false);
    setErrors({});
  };

  async function send() {
    const problems = answerErrors(survey.questions, values);
    setErrors(problems);
    if (Object.keys(problems).length) {
      toast.error(Object.keys(problems).length === 1 ? "Please answer the highlighted question." : "Please answer the highlighted questions.");
      return;
    }
    try {
      const outcome = await answer.mutateAsync({ surveyId: survey.id, versionId: doc.currentVersion?.id ?? null, anonymous, answers: answersPayload(survey.questions, values) });
      if (outcome.queued) toast.info("You're offline – your answers will be sent when you sync.");
      else if (!outcome.result.created) toast.info("You had already completed this induction – your first answers are kept.");
      else toast.success(anonymous ? "Thank you – your answers have been sent anonymously." : "Thank you – your answers have been sent.");
      reset();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === "VALIDATION_ERROR" && Array.isArray(error.details)) {
        const next: Record<string, string> = {};
        for (const d of error.details as { path?: string; message?: string }[]) {
          const id = d.path?.startsWith("answers.") ? d.path.slice("answers.".length) : null;
          if (id && d.message) next[id] = d.message;
        }
        setErrors(next);
      }
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      {guard.dialog}
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else
            guard.confirm(() => {
              reset();
              onOpenChange(false);
            });
        }}
      >
        <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          <SheetHeader className="border-b pr-12">
            <SheetTitle className="text-lg">{survey.title}</SheetTitle>
            <SheetDescription>
              {dueLine(survey).text} · {questionsLabel(survey.questions.length)} · {minutesLabel(estimatedMinutes(survey.questions))}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {survey.intro && <p className="text-sm text-muted-foreground">{survey.intro}</p>}
            <SurveyQuestionsForm
              idPrefix={`answer-${survey.id}`}
              questions={survey.questions}
              values={values}
              errors={errors}
              disabled={answer.isPending}
              onChange={(id, v) => {
                setValues((all) => ({ ...all, [id]: v }));
                if (errors[id])
                  setErrors((all) => {
                    const next = { ...all };
                    delete next[id];
                    return next;
                  });
              }}
            />
            {survey.allowAnonymous && (
              <label
                htmlFor={`anonymous-${survey.id}`}
                className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors", anonymous ? "border-brand bg-brand-soft/60" : "hover:bg-muted/50")}
              >
                <Checkbox
                  id={`anonymous-${survey.id}`}
                  className="mt-0.5 size-5"
                  checked={anonymous}
                  disabled={answer.isPending}
                  onCheckedChange={(v) => setAnonymous(v === true)}
                />
                <span className="text-sm">
                  <span className="font-medium">Answer anonymously</span>
                  <span className="block text-muted-foreground">{ANONYMOUS_EXPLANATION}</span>
                </span>
              </label>
            )}
            <p className="text-xs text-muted-foreground">Answers can&apos;t be changed once sent.</p>
          </div>
          <SheetFooter className="flex-row justify-end gap-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={answer.isPending}
              onClick={() =>
                guard.confirm(() => {
                  reset();
                  onOpenChange(false);
                })
              }
            >
              Cancel
            </Button>
            <Button type="button" size="lg" className="min-w-36" disabled={answer.isPending} onClick={() => void send()}>
              {answer.isPending ? <Spinner /> : <Send />} Send answers
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Reader induction card (right column under the acknowledgement panel): status, size, and a big
 * "Complete the induction" button that stays disabled until the document has been opened.
 */
export function SurveyCard({ doc, openedLocally }: { doc: DocumentViewerDto; openedLocally: boolean }) {
  const query = useMySurvey(doc.id);
  const pending = usePendingSurveyAnswers().has(doc.id);
  const [open, setOpen] = useState(false);

  if (query.isPending) return <Skeleton className="h-40 rounded-xl" />;
  const survey = query.data?.survey;
  if (!survey) return null;

  const header = (
    <CardHeader>
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand uppercase">
        <ClipboardList className="size-4" /> Employee Induction
      </p>
      <CardTitle className="leading-snug">{survey.title}</CardTitle>
    </CardHeader>
  );

  if (survey.answered) {
    return (
      <Card className="border-success/30 ring-success/30">
        {header}
        <CardContent className="space-y-2 text-sm">
          <p className="flex items-start gap-2 rounded-lg bg-success/10 p-3 font-medium text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            Thanks – you completed this induction on {formatDate(survey.answered.answeredAt)}
            {survey.answered.anonymous ? " (anonymously)" : ""}.
          </p>
          {survey.answered.anonymous && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" /> Your name is not stored with your answers.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (pending) {
    return (
      <Alert className="border-info/40 bg-info/10">
        <CloudOff />
        <AlertTitle>Induction answers pending sync</AlertTitle>
        <AlertDescription>Your answers are saved on this device. They will be sent when you&apos;re back online and press Sync.</AlertDescription>
      </Alert>
    );
  }

  if (survey.status !== "ACTIVE" || doc.status !== "PUBLISHED" || !survey.assigned) {
    const message =
      survey.status !== "ACTIVE"
        ? "This induction is closed."
        : doc.status !== "PUBLISHED"
          ? "The induction goes live when it is published."
          : "This induction is for the people it is assigned to.";
    return (
      <Card>
        {header}
        <CardContent className="flex items-start gap-2 text-sm text-muted-foreground">
          {survey.status !== "ACTIVE" ? <Lock className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0 text-brand" />}
          {message}
        </CardContent>
      </Card>
    );
  }

  const opened = survey.openedCurrentVersion || openedLocally || doc.openedCurrentVersion;
  const due = dueLine(survey);

  return (
    <Card className={cn(survey.isMandatory ? (due.overdue ? "ring-destructive/40" : "ring-warning/40") : "ring-brand/30")}>
      {header}
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <StatusBadge tone={due.overdue ? "danger" : survey.isMandatory ? "warning" : "brand"} dot>
            {due.text}
          </StatusBadge>
          <p className="text-sm text-muted-foreground">
            {questionsLabel(survey.questions.length)} · {minutesLabel(estimatedMinutes(survey.questions))}
          </p>
        </div>
        {!opened && <p className="text-xs text-muted-foreground">Open the file first – you can complete the induction once you have opened it.</p>}
        <Button size="lg" className="h-11 w-full" disabled={!opened} onClick={() => setOpen(true)}>
          <ClipboardList /> Complete the induction
        </Button>
        <AnswerSheet doc={doc} survey={survey} open={open} onOpenChange={setOpen} />
      </CardContent>
    </Card>
  );
}
