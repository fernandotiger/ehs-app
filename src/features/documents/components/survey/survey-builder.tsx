"use client";

import { ArrowDown, ArrowUp, Eye, Lock, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SURVEY_LIMITS, SURVEY_QUESTION_TYPES, type SurveyQuestionTypeValue } from "@/lib/validation/document-surveys";
import { cn } from "@/lib/utils";
import {
  draftKey,
  newQuestion,
  QUESTION_TYPE_META,
  type DraftErrors,
  type QuestionDraft,
  type SurveyDraft,
  type SurveyDraftUpdater,
} from "../../survey-format";
import { SurveyPreviewDialog } from "./survey-preview-dialog";

function Err({ errors, path }: { errors: DraftErrors; path: string }) {
  const message = errors[path];
  return message ? <FieldError errors={[{ message }]} /> : null;
}

/** The three answer types as big, obvious buttons. */
function TypePicker({ value, onChange, disabled, id }: { value: SurveyQuestionTypeValue; onChange: (type: SurveyQuestionTypeValue) => void; disabled?: boolean; id: string }) {
  return (
    <div role="radiogroup" aria-label="Answer type" id={id} className="grid grid-cols-3 gap-2">
      {SURVEY_QUESTION_TYPES.map((type) => {
        const meta = QUESTION_TYPE_META[type];
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(type)}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-2 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:gap-2 sm:text-sm",
              active ? "border-brand bg-brand-soft text-brand" : "border-border bg-card text-foreground hover:bg-muted/60",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <meta.icon className="size-5 shrink-0" />
            <span className="leading-tight">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function OptionsEditor({
  question,
  index,
  update,
  errors,
  disabled,
}: {
  question: QuestionDraft;
  index: number;
  update: (change: (q: QuestionDraft) => QuestionDraft) => void;
  errors: DraftErrors;
  disabled?: boolean;
}) {
  const canRemove = question.options.length > SURVEY_LIMITS.minOptions;
  const canAdd = question.options.length < SURVEY_LIMITS.maxOptions;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Options</p>
      <ul className="space-y-2">
        {question.options.map((option, oi) => {
          const path = `questions.${index}.options.${oi}`;
          return (
            <li key={option.key}>
              <div className="flex items-center gap-2">
                <span className={cn("flex size-5 shrink-0 items-center justify-center border-2 border-muted-foreground/40", question.type === "SINGLE" ? "rounded-full" : "rounded-md")} aria-hidden />
                <Input
                  value={option.value}
                  maxLength={SURVEY_LIMITS.optionMax}
                  placeholder={`Option ${oi + 1}`}
                  aria-label={`Option ${oi + 1}`}
                  aria-invalid={Boolean(errors[path])}
                  disabled={disabled}
                  className="h-10"
                  onChange={(e) => {
                    const value = e.target.value;
                    update((q) => ({ ...q, options: q.options.map((o) => (o.key === option.key ? { ...o, value } : o)) }));
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove option ${oi + 1}`}
                  title={canRemove ? "Remove option" : "A choice question needs at least 2 options"}
                  disabled={disabled || !canRemove}
                  onClick={() => update((q) => ({ ...q, options: q.options.filter((o) => o.key !== option.key) }))}
                >
                  <X />
                </Button>
              </div>
              <Err errors={errors} path={path} />
            </li>
          );
        })}
      </ul>
      <Err errors={errors} path={`questions.${index}.options`} />
      {!disabled && (
        <Button type="button" variant="outline" size="sm" disabled={!canAdd} onClick={() => update((q) => ({ ...q, options: [...q.options, { key: draftKey("o"), value: "" }] }))}>
          <Plus /> Add option
        </Button>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  index,
  count,
  onChange,
  errors,
  locked,
}: {
  question: QuestionDraft;
  index: number;
  count: number;
  onChange: SurveyDraftUpdater;
  errors: DraftErrors;
  locked: boolean;
}) {
  const update = (change: (q: QuestionDraft) => QuestionDraft) =>
    onChange((d) => ({ ...d, questions: d.questions.map((q) => (q.key === question.key ? change(q) : q)) }));

  const move = (delta: number) =>
    onChange((d) => {
      const from = d.questions.findIndex((q) => q.key === question.key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= d.questions.length) return d;
      const questions = [...d.questions];
      const [item] = questions.splice(from, 1);
      questions.splice(to, 0, item!);
      return { ...d, questions };
    });

  const remove = () => {
    let removedAt = -1;
    onChange((d) => {
      removedAt = d.questions.findIndex((q) => q.key === question.key);
      return { ...d, questions: d.questions.filter((q) => q.key !== question.key) };
    });
    toast(`Question ${index + 1} deleted`, {
      action: {
        label: "Undo",
        onClick: () =>
          onChange((d) => {
            if (d.questions.some((q) => q.key === question.key)) return d;
            const questions = [...d.questions];
            const at = removedAt >= 0 ? removedAt : index;
            questions.splice(Math.min(at, questions.length), 0, question);
            return { ...d, questions };
          }),
      },
    });
  };

  const setType = (type: SurveyQuestionTypeValue) =>
    update((q) => ({
      ...q,
      type,
      // Keep typed options when switching between choice types; start with two empty ones otherwise.
      options: type === "TEXT" ? q.options : q.options.length ? q.options : [{ key: draftKey("o"), value: "" }, { key: draftKey("o"), value: "" }],
    }));

  const labelId = `${question.key}-label`;
  const helpId = `${question.key}-help`;
  const requiredId = `${question.key}-required`;

  return (
    <li className="rounded-xl border bg-card p-3 shadow-xs sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">{index + 1}</span>
        <p className="flex-1 font-semibold">Question {index + 1}</p>
        {!locked && (
          <div className="flex items-center">
            <Button type="button" variant="ghost" size="icon" aria-label="Move question up" title="Move up" disabled={index === 0} onClick={() => move(-1)}>
              <ArrowUp />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Move question down" title="Move down" disabled={index === count - 1} onClick={() => move(1)}>
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete question ${index + 1}`}
              title="Delete question"
              onClick={remove}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Field data-invalid={Boolean(errors[`questions.${index}.label`])}>
          <FieldLabel htmlFor={labelId}>Question</FieldLabel>
          <Input
            id={labelId}
            value={question.label}
            maxLength={SURVEY_LIMITS.labelMax}
            placeholder="e.g. Did you understand this document?"
            className="h-10"
            disabled={locked}
            aria-invalid={Boolean(errors[`questions.${index}.label`])}
            onChange={(e) => {
              const label = e.target.value;
              update((q) => ({ ...q, label }));
            }}
          />
          <Err errors={errors} path={`questions.${index}.label`} />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${question.key}-type`}>How do people answer?</FieldLabel>
          <TypePicker id={`${question.key}-type`} value={question.type} onChange={setType} disabled={locked} />
          <FieldDescription>{QUESTION_TYPE_META[question.type].hint}.</FieldDescription>
        </Field>

        {question.type !== "TEXT" && <OptionsEditor question={question} index={index} update={update} errors={errors} disabled={locked} />}

        <Field>
          <FieldLabel htmlFor={helpId}>
            Help line <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            id={helpId}
            value={question.help}
            maxLength={SURVEY_LIMITS.helpMax}
            placeholder="A short hint shown under the question"
            className="h-10"
            disabled={locked}
            onChange={(e) => {
              const help = e.target.value;
              update((q) => ({ ...q, help }));
            }}
          />
          <Err errors={errors} path={`questions.${index}.help`} />
        </Field>

        <Field orientation="horizontal" className="rounded-lg bg-muted/50 p-3">
          <FieldContent>
            <FieldLabel htmlFor={requiredId}>Answer required</FieldLabel>
            <FieldDescription>People must answer this question before sending.</FieldDescription>
          </FieldContent>
          <Switch id={requiredId} checked={question.required} disabled={locked} onCheckedChange={(required) => update((q) => ({ ...q, required }))} />
        </Field>
      </div>
    </li>
  );
}

/**
 * Survey builder: title, intro, "Everyone must answer" (+ "Answer within N days"),
 * "Let people answer anonymously", numbered question cards and a live Preview.
 * Controlled: `onChange` receives an updater so undo toasts always apply to the latest draft.
 */
export function SurveyBuilder({
  draft,
  onChange,
  errors,
  questionsLocked = false,
  anonymityLocked = false,
  idPrefix = "survey",
}: {
  draft: SurveyDraft;
  onChange: SurveyDraftUpdater;
  /** Inline errors to show (pass {} until the user first tries to save). */
  errors: DraftErrors;
  questionsLocked?: boolean;
  /** Anonymous answers exist – anonymity can no longer be switched off. */
  anonymityLocked?: boolean;
  idPrefix?: string;
}) {
  const set = <K extends keyof SurveyDraft>(key: K, value: SurveyDraft[K]) => onChange((d) => ({ ...d, [key]: value }));
  const canAddQuestion = draft.questions.length < SURVEY_LIMITS.maxQuestions;

  return (
    <div className="space-y-5">
      <div className="grid gap-4">
        <Field data-invalid={Boolean(errors.title)}>
          <FieldLabel htmlFor={`${idPrefix}-title`}>Survey title</FieldLabel>
          <Input
            id={`${idPrefix}-title`}
            value={draft.title}
            maxLength={SURVEY_LIMITS.titleMax}
            placeholder="e.g. Manual handling – understanding check"
            className="h-10"
            aria-invalid={Boolean(errors.title)}
            onChange={(e) => set("title", e.target.value)}
          />
          <Err errors={errors} path="title" />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-intro`}>
            Introduction <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            id={`${idPrefix}-intro`}
            value={draft.intro}
            maxLength={SURVEY_LIMITS.introMax}
            rows={2}
            placeholder="Tell readers why you are asking, e.g. “Help us check the new rules are clear.”"
            onChange={(e) => set("intro", e.target.value)}
          />
          <Err errors={errors} path="intro" />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border p-3">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`${idPrefix}-mandatory`}>Everyone must answer</FieldLabel>
              <FieldDescription>Shows as “Action required” for readers until they answer.</FieldDescription>
            </FieldContent>
            <Switch id={`${idPrefix}-mandatory`} checked={draft.isMandatory} onCheckedChange={(v) => set("isMandatory", v)} />
          </Field>
          {draft.isMandatory && (
            <Field data-invalid={Boolean(errors.dueDays)}>
              <FieldLabel htmlFor={`${idPrefix}-due`}>Answer within</FieldLabel>
              <div className="relative max-w-40">
                <Input
                  id={`${idPrefix}-due`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  className="h-10 pr-12"
                  value={Number.isFinite(draft.dueDays) ? draft.dueDays : ""}
                  aria-invalid={Boolean(errors.dueDays)}
                  onChange={(e) => set("dueDays", e.target.value === "" ? Number.NaN : Number(e.target.value))}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">days</span>
              </div>
              <FieldDescription>Counted from when the document is published.</FieldDescription>
              <Err errors={errors} path="dueDays" />
            </Field>
          )}
        </div>
        <div className="rounded-xl border p-3">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`${idPrefix}-anonymous`}>Let people answer anonymously</FieldLabel>
              <FieldDescription>
                {anonymityLocked && draft.allowAnonymous
                  ? "Anonymous answers have been given, so this stays on."
                  : "Readers can choose to leave their name off their answers."}
              </FieldDescription>
            </FieldContent>
            <Switch
              id={`${idPrefix}-anonymous`}
              checked={draft.allowAnonymous}
              disabled={anonymityLocked && draft.allowAnonymous}
              onCheckedChange={(v) => set("allowAnonymous", v)}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">
            Questions <span className="font-normal text-muted-foreground">({draft.questions.length})</span>
          </h3>
          <SurveyPreviewDialog
            draft={draft}
            trigger={
              <Button type="button" variant="outline">
                <Eye /> Preview
              </Button>
            }
          />
        </div>
        {questionsLocked && (
          <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" /> The questions are locked because people have already answered.
          </p>
        )}
        <Err errors={errors} path="questions" />
        <ol className="space-y-3">
          {draft.questions.map((question, index) => (
            <QuestionCard key={question.key} question={question} index={index} count={draft.questions.length} onChange={onChange} errors={errors} locked={questionsLocked} />
          ))}
        </ol>
        {!questionsLocked && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-full border-2 border-dashed text-brand hover:bg-brand-soft hover:text-brand"
            disabled={!canAddQuestion}
            onClick={() => onChange((d) => ({ ...d, questions: [...d.questions, newQuestion("SINGLE")] }))}
          >
            <Plus /> {canAddQuestion ? "Add question" : `Up to ${SURVEY_LIMITS.maxQuestions} questions`}
          </Button>
        )}
      </div>
    </div>
  );
}
