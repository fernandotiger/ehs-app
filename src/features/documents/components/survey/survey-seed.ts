import { pickChanged, seedBoolean, seedEnum, seedInt, seedObject, seedText } from "@/lib/favourites/seed";
import { SURVEY_LIMITS, SURVEY_QUESTION_TYPES, type SurveyQuestionTypeValue } from "@/lib/validation/document-surveys";
import type { AckSettingsInput, AudienceInput } from "@/lib/validation/documents";
import type { QuestionDraft, SurveyDraft } from "../../survey-format";
import { mergeAck, mergeAudience, type KnownStructure } from "../manage/document-seed";

/**
 * Create response form – what a favourite keeps (brief 09 §2B): the response form settings (title,
 * introduction, everyone must complete it, complete within N days, anonymous answers), the questions
 * as drafted, who should have access and the acknowledgement settings.
 *
 * Never kept: the file people read first – so "confirm they have read the file" always comes back
 * switched off (it needs a file).
 */

export interface SurveySettingsValues {
  audience: AudienceInput;
  ack: AckSettingsInput;
}

interface KeptQuestion {
  type: SurveyQuestionTypeValue;
  label: string;
  help: string;
  required: boolean;
  options: string[];
}

const KEPT = ["title", "intro", "isMandatory", "dueDays", "allowAnonymous"] as const satisfies readonly (keyof SurveyDraft)[];

export type SurveySeed = Partial<Pick<SurveyDraft, (typeof KEPT)[number]>> & Partial<SurveySettingsValues> & { questions?: KeptQuestion[] };

function questionsOf(draft: SurveyDraft): KeptQuestion[] {
  return draft.questions.map((q) => ({ type: q.type, label: q.label, help: q.help, required: q.required, options: q.type === "TEXT" ? [] : q.options.map((o) => o.value) }));
}

/** Capture: what the creator changed from a fresh page (questions are kept as a whole once any of them changed). */
export function pickSurvey(draft: SurveyDraft, freshDraft: SurveyDraft, settings: SurveySettingsValues, freshSettings: SurveySettingsValues): SurveySeed {
  const seed: SurveySeed = { ...pickChanged(draft, freshDraft, KEPT), ...pickChanged(settings, freshSettings, ["audience", "ack"] as const) };
  const questions = questionsOf(draft);
  if (JSON.stringify(questions) !== JSON.stringify(questionsOf(freshDraft))) seed.questions = questions;
  return seed;
}

function mergeQuestion(value: unknown): QuestionDraft | null {
  const q = seedObject(value);
  const type = q ? seedEnum(q.type, SURVEY_QUESTION_TYPES) : undefined;
  if (!q || !type) return null;
  const options =
    type === "TEXT"
      ? []
      : (Array.isArray(q.options) ? q.options : [])
          .filter((o): o is string => typeof o === "string")
          .slice(0, SURVEY_LIMITS.maxOptions)
          .map((o) => o.slice(0, SURVEY_LIMITS.optionMax));
  while (type !== "TEXT" && options.length < SURVEY_LIMITS.minOptions) options.push("");
  return {
    key: `q${crypto.randomUUID()}`,
    type,
    label: seedText(q.label, SURVEY_LIMITS.labelMax) ?? "",
    help: seedText(q.help, SURVEY_LIMITS.helpMax) ?? "",
    required: seedBoolean(q.required) ?? true,
    options: options.map((option) => ({ key: `o${crypto.randomUUID()}`, value: option })),
  };
}

/**
 * Restore: the kept settings and questions on top of a fresh page. `ackKept` = the favourite had
 * acknowledgement settings (the page then skips the system defaults).
 */
export function mergeSurvey(
  fresh: { draft: SurveyDraft; settings: SurveySettingsValues },
  saved: unknown,
  context: { known?: KnownStructure } = {},
): { draft: SurveyDraft; settings: SurveySettingsValues; ackKept: boolean } {
  const s = seedObject(saved) ?? {};
  const questions = (Array.isArray(s.questions) ? s.questions : [])
    .slice(0, SURVEY_LIMITS.maxQuestions)
    .map(mergeQuestion)
    .filter((q): q is QuestionDraft => q !== null);
  const ack = mergeAck(fresh.settings.ack, s.ack);
  return {
    draft: {
      title: seedText(s.title, SURVEY_LIMITS.titleMax) ?? fresh.draft.title,
      intro: seedText(s.intro, SURVEY_LIMITS.introMax) ?? fresh.draft.intro,
      isMandatory: seedBoolean(s.isMandatory) ?? fresh.draft.isMandatory,
      dueDays: seedInt(s.dueDays, 1, 365) ?? fresh.draft.dueDays,
      allowAnonymous: seedBoolean(s.allowAnonymous) ?? fresh.draft.allowAnonymous,
      questions: questions.length ? questions : fresh.draft.questions,
    },
    settings: {
      audience: mergeAudience(fresh.settings.audience, s.audience, context.known),
      // Confirming the file needs a file, and files are never kept.
      ack: { ...ack.ack, requiresAcknowledgement: false },
    },
    ackKept: ack.kept,
  };
}
