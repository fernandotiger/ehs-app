"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { SURVEY_LIMITS, type SurveyQuestionTypeValue } from "@/lib/validation/document-surveys";
import { cn } from "@/lib/utils";

export interface AnswerableQuestion {
  id: string;
  type: SurveyQuestionTypeValue;
  label: string;
  help: string | null;
  required: boolean;
  options: string[];
}

export interface AnswerValue {
  text?: string;
  choices?: string[];
}

export type AnswerValues = Record<string, AnswerValue>;

/** Reader-side check before sending (the server checks the same rules again). */
export function answerErrors(questions: AnswerableQuestion[], values: AnswerValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const v = values[q.id];
    if (q.type === "TEXT") {
      const text = v?.text?.trim() ?? "";
      if (text.length > SURVEY_LIMITS.textAnswerMax) errors[q.id] = `Keep your answer under ${SURVEY_LIMITS.textAnswerMax} characters.`;
      else if (q.required && !text) errors[q.id] = "Please answer this question.";
    } else if (q.required && !(v?.choices?.length ?? 0)) {
      errors[q.id] = q.type === "SINGLE" ? "Please choose an option." : "Please choose at least one option.";
    }
  }
  return errors;
}

/** The answers payload (empty optional answers are left out). */
export function answersPayload(questions: AnswerableQuestion[], values: AnswerValues): { questionId: string; text?: string; choices?: string[] }[] {
  return questions.flatMap((q): { questionId: string; text?: string; choices?: string[] }[] => {
    const v = values[q.id];
    if (q.type === "TEXT") {
      const text = v?.text?.trim();
      return text ? [{ questionId: q.id, text }] : [];
    }
    return v?.choices?.length ? [{ questionId: q.id, choices: v.choices }] : [];
  });
}

/** Questions exactly as readers see them (answer sheet and the creator's Preview). */
export function SurveyQuestionsForm({
  questions,
  values,
  onChange,
  errors = {},
  disabled = false,
  idPrefix,
}: {
  questions: AnswerableQuestion[];
  values: AnswerValues;
  onChange: (questionId: string, value: AnswerValue) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  idPrefix: string;
}) {
  return (
    <ol className="space-y-4">
      {questions.map((q, index) => {
        const id = `${idPrefix}-${q.id}`;
        const value = values[q.id] ?? {};
        const error = errors[q.id];
        const labelId = `${id}-label`;
        return (
          <li key={q.id} className={cn("rounded-xl border p-3 sm:p-4", error && "border-destructive/60")}>
            <p id={labelId} className="font-medium leading-snug">
              <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
              {q.label || <span className="text-muted-foreground italic">Question text</span>}
              {q.required ? (
                <span className="ml-1 text-destructive" aria-hidden>
                  *
                </span>
              ) : (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
              )}
            </p>
            {q.help && <p className="mt-0.5 text-sm text-muted-foreground">{q.help}</p>}
            {q.type === "MULTIPLE" && <p className="mt-0.5 text-xs text-muted-foreground">Choose all that apply.</p>}

            <div className="mt-3">
              {q.type === "TEXT" && (
                <>
                  <Textarea
                    id={id}
                    aria-labelledby={labelId}
                    aria-invalid={Boolean(error)}
                    rows={3}
                    maxLength={SURVEY_LIMITS.textAnswerMax}
                    disabled={disabled}
                    placeholder="Type your answer"
                    value={value.text ?? ""}
                    onChange={(e) => onChange(q.id, { text: e.target.value })}
                  />
                  <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
                    {(value.text ?? "").length} / {SURVEY_LIMITS.textAnswerMax}
                  </p>
                </>
              )}
              {q.type === "SINGLE" && (
                <RadioGroup
                  aria-labelledby={labelId}
                  aria-invalid={Boolean(error)}
                  value={value.choices?.[0] ?? ""}
                  disabled={disabled}
                  onValueChange={(choice) => onChange(q.id, { choices: [choice] })}
                  className="gap-2"
                >
                  {q.options.map((option, oi) => {
                    const optionId = `${id}-o${oi}`;
                    const checked = value.choices?.[0] === option;
                    return (
                      <label
                        key={`${oi}-${option}`}
                        htmlFor={optionId}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                          checked ? "border-brand bg-brand-soft/60" : "hover:bg-muted/50",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <RadioGroupItem id={optionId} value={option} className="size-5" />
                        <span>{option || <span className="text-muted-foreground italic">Option {oi + 1}</span>}</span>
                      </label>
                    );
                  })}
                </RadioGroup>
              )}
              {q.type === "MULTIPLE" && (
                <div role="group" aria-labelledby={labelId} className="grid gap-2">
                  {q.options.map((option, oi) => {
                    const optionId = `${id}-o${oi}`;
                    const checked = value.choices?.includes(option) ?? false;
                    return (
                      <label
                        key={`${oi}-${option}`}
                        htmlFor={optionId}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                          checked ? "border-brand bg-brand-soft/60" : "hover:bg-muted/50",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <Checkbox
                          id={optionId}
                          className="size-5"
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(next) => {
                            const current = value.choices ?? [];
                            const choices = next === true ? [...current.filter((c) => c !== option), option] : current.filter((c) => c !== option);
                            onChange(q.id, { choices: q.options.filter((o) => choices.includes(o)) });
                          }}
                        />
                        <span>{option || <span className="text-muted-foreground italic">Option {oi + 1}</span>}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </li>
        );
      })}
    </ol>
  );
}
