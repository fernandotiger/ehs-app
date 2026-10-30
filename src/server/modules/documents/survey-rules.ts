/**
 * Pure document-survey rules: definition normalisation, answer validation, lock rules,
 * the can-answer guard, the k-anonymity filter and the reader status. No I/O and no framework
 * imports – unit-tested in survey-rules.test.ts and safe to import from client code.
 */
import {
  SURVEY_LIMITS,
  surveyDefinitionIssues,
  type SurveyAnswerItemInput,
  type SurveyDefinitionInput,
  type SurveyQuestionTypeValue,
  type SurveyStatusValue,
} from "@/lib/validation/document-surveys";
import { addDays } from "./acknowledgement-rules";

export { surveyDefinitionIssues };

export type MySurveyStatus = "ANSWERED" | "REQUIRED" | "OPTIONAL" | "OVERDUE" | "CLOSED";

/** A question as stored (and as compared by the lock rule). */
export interface SurveyQuestionShape {
  type: SurveyQuestionTypeValue;
  label: string;
  help: string | null;
  required: boolean;
  options: string[];
}

export interface StoredSurveyQuestion extends SurveyQuestionShape {
  id: string;
}

// ── Definition ──────────────────────────────────────────────────────────────

function clean(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

/** Trimmed questions in order; text questions never keep options. */
export function normaliseQuestions(questions: SurveyDefinitionInput["questions"]): SurveyQuestionShape[] {
  return questions.map((q) => ({
    type: q.type,
    label: q.label.trim(),
    help: clean(q.help),
    required: q.required,
    options: q.type === "TEXT" ? [] : q.options.map((o) => o.trim()),
  }));
}

/** True when two question lists differ in anything a reader sees (order included). */
export function questionsChanged(before: SurveyQuestionShape[], after: SurveyQuestionShape[]): boolean {
  if (before.length !== after.length) return true;
  return before.some((b, i) => {
    const a = after[i]!;
    return (
      a.type !== b.type ||
      a.label !== b.label ||
      (a.help ?? null) !== (b.help ?? null) ||
      a.required !== b.required ||
      a.options.length !== b.options.length ||
      a.options.some((o, oi) => o !== b.options[oi])
    );
  });
}

// ── Lock rules ──────────────────────────────────────────────────────────────

export interface SurveyEditContext {
  status: SurveyStatusValue;
  allowAnonymousBefore: boolean;
  allowAnonymousAfter: boolean;
  questionsChanged: boolean;
  /** Responses received so far (named + anonymous). */
  responseCount: number;
  anonymousCount: number;
}

/**
 * Why an edit is not allowed (null = allowed). Questions lock once the first answer arrives;
 * anonymity can go off → on any time but never on → off once anonymous answers exist; replaced
 * surveys are read-only.
 */
export function surveyEditProblem(ctx: SurveyEditContext): string | null {
  if (ctx.status === "REPLACED") return "This response form has been replaced and can no longer be changed.";
  if (ctx.questionsChanged && ctx.responseCount > 0) {
    return "The questions can't be changed because people have already answered. Use “Replace response form” to ask new questions – the current answers are kept.";
  }
  if (ctx.allowAnonymousBefore && !ctx.allowAnonymousAfter && ctx.anonymousCount > 0) {
    return "Anonymous answers have already been given, so anonymous answering can't be switched off.";
  }
  return null;
}

/** Status transitions for close / reopen. */
export function surveyTransitionProblem(status: SurveyStatusValue, action: "close" | "reopen"): string | null {
  if (status === "REPLACED") return "This response form has been replaced and can no longer be changed.";
  if (action === "close" && status !== "ACTIVE") return "This response form is already closed.";
  if (action === "reopen" && status !== "CLOSED") return "This response form is already open.";
  return null;
}

// ── Answering ───────────────────────────────────────────────────────────────

export interface AnswerGuardInput {
  documentStatus: string;
  surveyStatus: SurveyStatusValue;
  /** The reader is in the document's audience. */
  assigned: boolean;
  /** The reader opened the version they answer on (file-access audit row). */
  opened: boolean;
  anonymousRequested: boolean;
  allowAnonymous: boolean;
}

/** Why the reader cannot answer right now (null = they can). Same evidence rule as acknowledging. */
export function answerBlockReason(input: AnswerGuardInput): string | null {
  if (input.documentStatus !== "PUBLISHED") return "This response form is not published.";
  if (input.surveyStatus === "REPLACED") return "This response form has been replaced by a new one. Please reload the page and complete the new one.";
  if (input.surveyStatus !== "ACTIVE") return "This response form is closed.";
  if (!input.assigned) return "This response form is for the people it is assigned to.";
  if (!input.opened) return "Please open the file before completing the response form.";
  if (input.anonymousRequested && !input.allowAnonymous) return "This response form does not allow anonymous answers.";
  return null;
}

export interface NormalisedAnswer {
  questionId: string;
  text: string | null;
  choices: string[];
}

export interface AnswerIssue {
  questionId: string;
  message: string;
}

/**
 * Validates submitted answers against the survey's questions. Returns the answers to store
 * (unanswered optional questions are left out) or the problems in plain words.
 */
export function validateAnswers(
  questions: StoredSurveyQuestion[],
  answers: SurveyAnswerItemInput[],
): { ok: true; answers: NormalisedAnswer[] } | { ok: false; issues: AnswerIssue[] } {
  const issues: AnswerIssue[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const given = new Map<string, SurveyAnswerItemInput>();
  for (const a of answers) {
    if (!byId.has(a.questionId)) {
      issues.push({ questionId: a.questionId, message: "This question is not part of the response form any more. Please reload the page." });
      continue;
    }
    if (given.has(a.questionId)) {
      issues.push({ questionId: a.questionId, message: "This question was answered twice." });
      continue;
    }
    given.set(a.questionId, a);
  }

  const result: NormalisedAnswer[] = [];
  for (const q of questions) {
    const a = given.get(q.id);
    if (q.type === "TEXT") {
      const text = a?.text?.trim() ?? "";
      if (a?.choices?.length) issues.push({ questionId: q.id, message: "This question takes a written answer." });
      if (text.length > SURVEY_LIMITS.textAnswerMax) issues.push({ questionId: q.id, message: `Keep your answer under ${SURVEY_LIMITS.textAnswerMax} characters.` });
      else if (!text) {
        if (q.required) issues.push({ questionId: q.id, message: "Please answer this question." });
      } else result.push({ questionId: q.id, text, choices: [] });
      continue;
    }

    const choices = [...new Set(a?.choices ?? [])];
    if (a?.text?.trim()) issues.push({ questionId: q.id, message: "Choose from the options for this question." });
    if (choices.some((c) => !q.options.includes(c))) {
      issues.push({ questionId: q.id, message: "One of the chosen options is not in the list any more. Please reload the page." });
      continue;
    }
    if (q.type === "SINGLE" && choices.length > 1) {
      issues.push({ questionId: q.id, message: "Choose only one option." });
      continue;
    }
    if (!choices.length) {
      if (q.required) issues.push({ questionId: q.id, message: q.type === "SINGLE" ? "Please choose an option." : "Please choose at least one option." });
      continue;
    }
    // Keep the survey's option order so exports read consistently.
    result.push({ questionId: q.id, text: null, choices: q.options.filter((o) => choices.includes(o)) });
  }
  return issues.length ? { ok: false, issues } : { ok: true, answers: result };
}

// ── k-anonymity ─────────────────────────────────────────────────────────────

/** Anonymous answers count in results, charts and exports only once at least `threshold` exist. */
export function anonymousAnswersVisible(anonymousCount: number, threshold: number): boolean {
  return anonymousCount > 0 && anonymousCount >= Math.max(1, threshold);
}

/** "2 anonymous answers will show once there are at least 3." – null when nothing is hidden. */
export function anonymityNotice(anonymousCount: number, threshold: number): string | null {
  if (anonymousCount === 0 || anonymousAnswersVisible(anonymousCount, threshold)) return null;
  const n = anonymousCount === 1 ? "1 anonymous answer" : `${anonymousCount} anonymous answers`;
  return `${n} will show once there are at least ${Math.max(1, threshold)}.`;
}

/** Counts that may be shown: anonymous ones are left out until the threshold is reached. */
export function visibleResponseCounts(counts: { named: number; anonymous: number }, threshold: number) {
  const anonymousVisible = anonymousAnswersVisible(counts.anonymous, threshold);
  return {
    named: counts.named,
    anonymous: anonymousVisible ? counts.anonymous : 0,
    hiddenAnonymous: anonymousVisible ? 0 : counts.anonymous,
    visible: counts.named + (anonymousVisible ? counts.anonymous : 0),
    anonymousVisible,
  };
}

// ── Reader status & dates ───────────────────────────────────────────────────

function latest(...dates: (Date | null | undefined)[]): Date | null {
  let max: Date | null = null;
  for (const d of dates) if (d && (!max || d.getTime() > max.getTime())) max = d;
  return max;
}

/**
 * When a mandatory survey became a reader's obligation: the latest of the document's
 * publication, the survey becoming mandatory (creation, or the switch later on) and the reader
 * joining. Null while the document is unpublished.
 */
export function surveyRequiredSince(input: { publishedAt: Date | null; mandatorySince: Date | null; surveyCreatedAt: Date; userCreatedAt?: Date | null }): Date | null {
  if (!input.publishedAt) return null;
  return latest(input.publishedAt, input.mandatorySince ?? input.surveyCreatedAt, input.userCreatedAt);
}

export function surveyDueDate(since: Date | null, dueDays: number): Date | null {
  return since ? addDays(since, dueDays) : null;
}

export function readerSurveyStatus(input: { surveyStatus: SurveyStatusValue; isMandatory: boolean; answered: boolean; dueAt: Date | null; now: Date }): MySurveyStatus {
  if (input.answered) return "ANSWERED";
  if (input.surveyStatus !== "ACTIVE") return "CLOSED";
  if (!input.isMandatory) return "OPTIONAL";
  if (input.dueAt && input.now.getTime() > input.dueAt.getTime()) return "OVERDUE";
  return "REQUIRED";
}

/** Mandatory and still to do – counts as "Action required" and due work. */
export function isSurveyActionRequired(status: MySurveyStatus): boolean {
  return status === "REQUIRED" || status === "OVERDUE";
}

/** "about 1 minute" – choices ~10 s, text answers ~40 s. */
export function estimatedMinutes(questions: Pick<SurveyQuestionShape, "type">[]): number {
  const seconds = questions.reduce((sum, q) => sum + (q.type === "TEXT" ? 40 : 10), 0);
  return Math.max(1, Math.round(seconds / 60));
}

/** Percent rounded to a whole number (0 when the base is 0). */
export function percentOf(count: number, base: number): number {
  return base > 0 ? Math.round((count / base) * 100) : 0;
}

/** Company-local calendar day as a DATE value (UTC midnight) – responses keep no time of day. */
export function dateOnly(localDay: string): Date {
  return new Date(`${localDay}T00:00:00.000Z`);
}

// ── CSV export rows ─────────────────────────────────────────────────────────

export interface ExportResponseRow {
  isAnonymous: boolean;
  submittedOn: Date;
  /** Null when the survey had no file. */
  documentVersionNumber: number | null;
  respondent: { name: string; email: string; department: { name: string } | null } | null;
  answers: { questionId: string; text: string | null; choices: string[] }[];
}

export function surveyExportHeader(questions: { position: number; label: string }[]): string[] {
  return ["Respondent", "Email", "Department", "Answered on", "Document version", ...questions.map((q) => `Q${q.position}. ${q.label}`)];
}

/**
 * One CSV row per response. Anonymous rows say "Anonymous" and carry no email, department,
 * date or version. Several choices are joined with "; ". (Cells are escaped by csvRow.)
 */
export function surveyExportCells(row: ExportResponseRow, questions: { id: string; type: SurveyQuestionTypeValue }[]): (string | number | null)[] {
  const cells: (string | number | null)[] =
    row.isAnonymous || !row.respondent
      ? ["Anonymous", null, null, null, null]
      : [row.respondent.name, row.respondent.email, row.respondent.department?.name ?? null, row.submittedOn.toISOString().slice(0, 10), row.documentVersionNumber];
  for (const q of questions) {
    const answer = row.answers.find((a) => a.questionId === q.id);
    cells.push(answer ? (q.type === "TEXT" ? answer.text : answer.choices.join("; ")) : null);
  }
  return cells;
}
