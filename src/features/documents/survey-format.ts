import { CircleDot, ListChecks, TextCursorInput, type LucideIcon } from "lucide-react";
import type { BadgeTone } from "@/components/common/status-badge";
import { surveyDefinitionSchema, type SurveyDefinitionInput, type SurveyQuestionTypeValue } from "@/lib/validation/document-surveys";
import type { MySurveyStatus, SurveyDto } from "@/server/modules/documents/survey.dto";

/** Plain-word labels, drafts and examples for the survey builder and reader screens (shown to people as "Response form"). */

/** A survey's management page (opened from the Document Library's Response forms tab); documents use /documents/manage/:id. */
export function surveyPageHref(documentId: string): string {
  return `/documents/surveys/library/${documentId}`;
}

/** The Document Library's Response forms tab (the old Survey / Induction Library route redirects here). */
export const RESPONSE_FORMS_LIBRARY_HREF = "/documents/manage?tab=forms";

/**
 * Where an old Survey / Induction Library address (`/documents/surveys/library?…`, from links and favourites saved
 * before 30 Oct 2026) goes now: the Response forms tab, keeping its search, status, "Created by me" and page.
 */
export function responseFormsLibraryHref(query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams({ tab: "forms" });
  for (const [key, value] of Object.entries(query)) {
    if (key === "tab" || key === "type") continue;
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) if (v.trim()) params.append(key, v);
  }
  return `/documents/manage?${params.toString()}`;
}

export const QUESTION_TYPE_META: Record<SurveyQuestionTypeValue, { label: string; hint: string; icon: LucideIcon }> = {
  TEXT: { label: "Text answer", hint: "People write their answer", icon: TextCursorInput },
  SINGLE: { label: "One choice", hint: "People pick one option", icon: CircleDot },
  MULTIPLE: { label: "Several choices", hint: "People can pick more than one", icon: ListChecks },
};

export const MY_SURVEY_STATUS_META: Record<MySurveyStatus, { label: string; tone: BadgeTone }> = {
  ANSWERED: { label: "Response form completed", tone: "success" },
  REQUIRED: { label: "Response form to complete", tone: "warning" },
  OVERDUE: { label: "Response form to complete", tone: "danger" },
  OPTIONAL: { label: "Response form", tone: "brand" },
  CLOSED: { label: "Response form closed", tone: "neutral" },
};

export const ANONYMOUS_EXPLANATION = "Your name won't be saved with your answers. We only record that you took part.";

export function minutesLabel(minutes: number): string {
  return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function questionsLabel(count: number): string {
  return `${count} ${count === 1 ? "question" : "questions"}`;
}

// ── Builder drafts ──────────────────────────────────────────────────────────

let keySeq = 0;
/** Stable client-side keys for React lists (never sent to the server). */
export function draftKey(prefix = "k"): string {
  keySeq += 1;
  return `${prefix}${keySeq}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface OptionDraft {
  key: string;
  value: string;
}

export interface QuestionDraft {
  key: string;
  type: SurveyQuestionTypeValue;
  label: string;
  help: string;
  required: boolean;
  options: OptionDraft[];
}

export interface SurveyDraft {
  title: string;
  intro: string;
  isMandatory: boolean;
  dueDays: number;
  allowAnonymous: boolean;
  questions: QuestionDraft[];
}

export type SurveyDraftUpdater = (update: (draft: SurveyDraft) => SurveyDraft) => void;

function options(values: string[]): OptionDraft[] {
  return values.map((value) => ({ key: draftKey("o"), value }));
}

export function newQuestion(type: SurveyQuestionTypeValue = "SINGLE"): QuestionDraft {
  return { key: draftKey("q"), type, label: "", help: "", required: true, options: type === "TEXT" ? [] : options(["", ""]) };
}

export function surveyTitleFor(documentTitle: string): string {
  const title = documentTitle.trim();
  return title ? `Questions about ${title}` : "Questions about this document";
}

export function emptyDraft(documentTitle: string, defaultDueDays: number): SurveyDraft {
  return { title: surveyTitleFor(documentTitle), intro: "", isMandatory: false, dueDays: defaultDueDays, allowAnonymous: true, questions: [newQuestion("SINGLE")] };
}

export type SurveyExampleKey = "understanding" | "feedback";

export const SURVEY_EXAMPLES: Record<SurveyExampleKey, { label: string; description: string }> = {
  understanding: { label: "Understanding check", description: "Did people understand it, and what was unclear?" },
  feedback: { label: "Feedback", description: "How clear and useful is it, and any suggestions?" },
};

export function exampleDraft(example: SurveyExampleKey, documentTitle: string, defaultDueDays: number): SurveyDraft {
  const base = emptyDraft(documentTitle, defaultDueDays);
  if (example === "understanding") {
    return {
      ...base,
      questions: [
        { key: draftKey("q"), type: "SINGLE", label: "Did you understand this document?", help: "", required: true, options: options(["Yes", "Partly", "No"]) },
        { key: draftKey("q"), type: "TEXT", label: "What was unclear?", help: "Leave empty if everything was clear.", required: false, options: [] },
      ],
    };
  }
  return {
    ...base,
    questions: [
      { key: draftKey("q"), type: "SINGLE", label: "How clear is this document?", help: "", required: true, options: options(["Very clear", "Clear", "Not clear"]) },
      { key: draftKey("q"), type: "MULTIPLE", label: "Which parts were most useful?", help: "", required: false, options: options(["", ""]) },
      { key: draftKey("q"), type: "TEXT", label: "Any suggestions?", help: "", required: false, options: [] },
    ],
  };
}

export function draftFromSurvey(survey: SurveyDto): SurveyDraft {
  return {
    title: survey.title,
    intro: survey.intro ?? "",
    isMandatory: survey.isMandatory,
    dueDays: survey.effectiveDueDays,
    allowAnonymous: survey.allowAnonymous,
    questions: survey.questions.map((q) => ({
      key: draftKey("q"),
      type: q.type,
      label: q.label,
      help: q.help ?? "",
      required: q.required,
      options: q.type === "TEXT" ? [] : options(q.options),
    })),
  };
}

export function draftToInput(draft: SurveyDraft): SurveyDefinitionInput {
  return {
    title: draft.title,
    intro: draft.intro,
    isMandatory: draft.isMandatory,
    dueDays: draft.dueDays,
    allowAnonymous: draft.allowAnonymous,
    questions: draft.questions.map((q) => ({
      type: q.type,
      label: q.label,
      help: q.help,
      required: q.required,
      options: q.type === "TEXT" ? [] : q.options.map((o) => o.value),
    })),
  };
}

/** Inline errors by path ("title", "questions.0.label", "questions.0.options.1" …); empty = valid. */
export type DraftErrors = Record<string, string>;

export function validateDraft(draft: SurveyDraft): DraftErrors {
  const parsed = surveyDefinitionSchema.safeParse(draftToInput(draft));
  if (parsed.success) return {};
  const errors: DraftErrors = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "survey";
    errors[path] ??= issue.message;
  }
  return errors;
}

export function draftsEqual(a: SurveyDraft, b: SurveyDraft): boolean {
  return JSON.stringify(draftToInput(a)) === JSON.stringify(draftToInput(b));
}
