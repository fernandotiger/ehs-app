"use client";

import { CircleHelp, Info, Lightbulb, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { EmptyState } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { errorMessage } from "@/lib/api-client";
import { APPLICABILITY_LABELS, type AnswerKey } from "@/lib/simplified-law";
import { applicabilitySuggestion, SUGGESTION_TEXT } from "@/lib/simplified-law/rules";
import { cn } from "@/lib/utils";
import { useSaveApplicability, type SlawLegislationDetailDto } from "../api";
import { blockersOf, formatDate, STALE_MESSAGE } from "../format";
import { Blockers } from "./shared";

type Decision = "APPLIES" | "DOES_NOT_APPLY";

/** Storyboard step 4 "Applicable to us?": screening questions answered Yes/No with a reason, then the decision. */
export function ApplicabilityTab({ law, onDecided }: { law: SlawLegislationDetailDto; onDecided: (decision: Decision) => void }) {
  const name = law.shortTitle || law.title;
  const [answers, setAnswers] = useState(() => Object.fromEntries(law.questions.map((q) => [q.id, { answer: q.answer, reason: q.reason }])) as Record<string, { answer: AnswerKey | null; reason: string }>);
  const [decision, setDecision] = useState<Decision | null>(law.applicability === "NOT_CHECKED" ? null : law.applicability);
  const [reason, setReason] = useState(law.applicabilityReason);
  const [blockers, setBlockers] = useState<string[]>([]);
  const save = useSaveApplicability(law.id);
  const editable = law.rights.assess;

  if (law.status === "REPEALED") {
    return <EmptyState icon={Info} title="Nothing to check" description="This law is repealed. It stays listed for reference, but there are no questions or requirements to answer." />;
  }

  const suggestion = applicabilitySuggestion(law.questions.map((q) => answers[q.id]?.answer ?? null));
  const setAnswer = (id: string, patch: Partial<{ answer: AnswerKey | null; reason: string }>) => setAnswers((a) => ({ ...a, [id]: { ...a[id]!, ...patch } }));

  async function submit(withDecision: boolean) {
    setBlockers([]);
    if (withDecision && !decision) {
      setBlockers(["Choose whether the law applies to us."]);
      return;
    }
    try {
      await save.mutateAsync({
        expectedVersion: law.version,
        answers: law.questions.map((q) => ({ questionId: q.id, answer: answers[q.id]?.answer ?? null, reason: answers[q.id]?.reason ?? "" })),
        decision: withDecision ? decision : null,
        reason: withDecision ? reason : "",
      });
      if (withDecision && decision) {
        toast.success(decision === "APPLIES" ? "Saved – now check the requirements" : "Saved – marked as not applicable");
        onDecided(decision);
      } else {
        toast.success("Answers saved");
      }
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? STALE_MESSAGE : errorMessage(error));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Is {name} applicable to us?</CardTitle>
          <CardDescription>Answer each question and give a reason. Any Yes means the law is likely relevant.</CardDescription>
        </CardHeader>
        {law.questions.length === 0 ? (
          <CardContent className="py-6 text-sm text-muted-foreground">No screening questions for this law – decide directly on the right.</CardContent>
        ) : (
          <ul className="divide-y">
            {law.questions.map((q, i) => {
              const a = answers[q.id] ?? { answer: null, reason: "" };
              return (
                <li key={q.id} className="grid gap-2 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                  <p className="text-sm font-medium">
                    <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                    {q.text}
                  </p>
                  {editable ? (
                    <ToggleGroup type="single" variant="outline" value={a.answer ?? ""} onValueChange={(v) => setAnswer(q.id, { answer: (v || null) as AnswerKey | null })} className="w-full md:w-40" aria-label={q.text}>
                      <ToggleGroupItem value="YES" className="flex-1 data-[state=on]:bg-brand-soft data-[state=on]:text-brand">
                        Yes
                      </ToggleGroupItem>
                      <ToggleGroupItem value="NO" className="flex-1 data-[state=on]:bg-muted">
                        No
                      </ToggleGroupItem>
                    </ToggleGroup>
                  ) : (
                    <span className={cn("text-sm font-medium", !a.answer && "text-muted-foreground")}>{a.answer === "YES" ? "Yes" : a.answer === "NO" ? "No" : "Not yet answered"}</span>
                  )}
                  {editable ? (
                    <Input className="md:col-span-2" value={a.reason} onChange={(e) => setAnswer(q.id, { reason: e.target.value })} placeholder="Reason (optional) – e.g. our EU markets: Ireland, Spain, France" aria-label={`Reason for: ${q.text}`} />
                  ) : a.reason ? (
                    <p className="text-sm text-muted-foreground md:col-span-2">Reason: {a.reason}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="space-y-4">
        <Alert className={cn(suggestion === "LIKELY" && "border-brand/40 bg-brand-soft/40")}>
          {suggestion === "UNKNOWN" ? <CircleHelp className="size-4" /> : <Lightbulb className="size-4" />}
          <AlertTitle>{suggestion === "LIKELY" ? "Likely applies" : suggestion === "UNLIKELY" ? "Probably does not apply" : "Keep answering"}</AlertTitle>
          <AlertDescription>{SUGGESTION_TEXT[suggestion]}</AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Our decision</CardTitle>
            <CardDescription>
              {law.applicability === "NOT_CHECKED"
                ? "Not decided yet."
                : `${APPLICABILITY_LABELS[law.applicability]}${law.applicabilityBy ? ` – ${law.applicabilityBy.name}, ${formatDate(law.applicabilityAt)}` : ""}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {editable ? (
              <>
                <RadioGroup value={decision ?? ""} onValueChange={(v) => setDecision(v as Decision)} className="gap-2">
                  <FieldLabel className="flex items-start gap-3 rounded-lg border p-3 font-normal">
                    <RadioGroupItem value="APPLIES" className="mt-0.5" />
                    <FieldContent>
                      <span className="font-medium">Yes, it applies to us</span>
                      <FieldDescription>The requirements checklist opens next.</FieldDescription>
                    </FieldContent>
                  </FieldLabel>
                  <FieldLabel className="flex items-start gap-3 rounded-lg border p-3 font-normal">
                    <RadioGroupItem value="DOES_NOT_APPLY" className="mt-0.5" />
                    <FieldContent>
                      <span className="font-medium">No, it does not apply</span>
                      <FieldDescription>Say why. No requirements are checked.</FieldDescription>
                    </FieldContent>
                  </FieldLabel>
                </RadioGroup>
                <Field>
                  <FieldLabel htmlFor="slaw-decision-reason">Reason{decision === "DOES_NOT_APPLY" ? " *" : " (optional)"}</FieldLabel>
                  <Textarea id="slaw-decision-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={decision === "DOES_NOT_APPLY" ? "e.g. We do not place any packaged products on the market." : "e.g. We import goods in plastic packaging."} />
                  {decision === "DOES_NOT_APPLY" && law.counts.openActions > 0 && (
                    <FieldDescription className="text-warning">Its {law.counts.openActions} open action{law.counts.openActions === 1 ? " is" : "s are"} closed when you save.</FieldDescription>
                  )}
                </Field>
                <Blockers title="Not saved yet" blockers={blockers} />
                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                  <Button className="flex-1" disabled={save.isPending} onClick={() => void submit(true)}>
                    {save.isPending ? <Spinner /> : <Save />} Save decision
                  </Button>
                  {law.questions.length > 0 && (
                    <Button variant="outline" className="flex-1" disabled={save.isPending} onClick={() => void submit(false)}>
                      Save answers only
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm">{law.applicabilityReason || <span className="text-muted-foreground">No reason given.</span>}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
