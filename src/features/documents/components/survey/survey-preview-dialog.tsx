"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { estimatedMinutes } from "@/server/modules/documents/survey-rules";
import { ANONYMOUS_EXPLANATION, minutesLabel, questionsLabel, type SurveyDraft } from "../../survey-format";
import { SurveyQuestionsForm, type AnswerValues } from "./survey-questions-form";

/** "Preview" – the survey exactly as readers will see it (answers are not sent anywhere). */
export function SurveyPreviewDialog({ draft, trigger }: { draft: SurveyDraft; trigger: React.ReactNode }) {
  const [values, setValues] = useState<AnswerValues>({});
  const [anonymous, setAnonymous] = useState(false);
  const questions = draft.questions.map((q) => ({
    id: q.key,
    type: q.type,
    label: q.label.trim(),
    help: q.help.trim() || null,
    required: q.required,
    options: q.type === "TEXT" ? [] : q.options.map((o) => o.value.trim()),
  }));

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setValues({});
          setAnonymous(false);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-brand">
            <Eye className="size-3.5" /> Preview – what readers will see
          </p>
          <DialogTitle className="text-lg">{draft.title.trim() || "Response form title"}</DialogTitle>
          <DialogDescription>
            {draft.isMandatory ? `Required · complete within ${Number.isFinite(draft.dueDays) ? draft.dueDays : "?"} days` : "Optional"} · {questionsLabel(questions.length)} ·{" "}
            {minutesLabel(estimatedMinutes(questions))}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60dvh] space-y-4 overflow-y-auto p-4">
          {draft.intro.trim() && <p className="text-sm text-muted-foreground">{draft.intro.trim()}</p>}
          <SurveyQuestionsForm idPrefix="preview" questions={questions} values={values} onChange={(id, v) => setValues((all) => ({ ...all, [id]: v }))} />
          {draft.allowAnonymous && (
            <label htmlFor="preview-anonymous" className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
              <Checkbox id="preview-anonymous" className="mt-0.5 size-5" checked={anonymous} onCheckedChange={(v) => setAnonymous(v === true)} />
              <span className="text-sm">
                <span className="font-medium">Answer anonymously</span>
                <span className="block text-muted-foreground">{ANONYMOUS_EXPLANATION}</span>
              </span>
            </label>
          )}
        </div>
        <DialogFooter className="m-0 items-center rounded-b-xl border-t p-4">
          <p className="text-xs text-muted-foreground sm:mr-auto">This is a preview – nothing is sent.</p>
          <Button type="button" disabled>
            Send answers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
