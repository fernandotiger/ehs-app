/**
 * Response shapes of the document survey API. Framework-free so client code can `import type`
 * them. Dates are ISO strings. Nothing here ever links an anonymous answer to a person.
 */
import type { Paginated } from "@/lib/validation/common";
import type { SurveyQuestionTypeValue, SurveyStatusValue } from "@/lib/validation/document-surveys";
import type { NamedRef } from "./document.dto";
import type { MySurveyStatus } from "./survey-rules";

export type { MySurveyStatus };

export interface SurveyQuestionDto {
  id: string;
  position: number;
  type: SurveyQuestionTypeValue;
  label: string;
  help: string | null;
  required: boolean;
  options: string[];
}

/** Creator view of one survey (manage page, edit form). */
export interface SurveyDto {
  id: string;
  documentId: string;
  title: string;
  intro: string | null;
  isMandatory: boolean;
  /** Stored value (null = setting default). */
  dueDays: number | null;
  /** Value in force (stored or the setting default). */
  effectiveDueDays: number;
  allowAnonymous: boolean;
  status: SurveyStatusValue;
  version: number;
  createdBy: NamedRef;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  replacedAt: string | null;
  questions: SurveyQuestionDto[];
  /** People who took part (participation rows). */
  participantCount: number;
  /** Responses stored – named + anonymous. */
  responseCount: number;
  anonymousCount: number;
  /** Questions are locked once the first answer arrives. */
  questionsLocked: boolean;
  /** Anonymous answering can no longer be switched off. */
  anonymityLocked: boolean;
}

export interface PreviousSurveyDto {
  id: string;
  title: string;
  createdAt: string;
  replacedAt: string | null;
  participantCount: number;
}

export interface DocumentSurveyManageDto {
  documentStatus: string;
  current: SurveyDto | null;
  previous: PreviousSurveyDto[];
  /** The documentSurvey setting (default "answer within", anonymity threshold). */
  settings: { anonymityThreshold: number; defaultDueDays: number };
}

/** Small survey indicator on library rows, the manage header and My Documents rows. */
export interface SurveySummaryDto {
  id: string;
  title: string;
  status: SurveyStatusValue;
  isMandatory: boolean;
  participantCount: number;
}

/** Reader's status for the current survey of a document (My Documents rows). */
export interface MySurveySummaryDto {
  id: string;
  status: MySurveyStatus;
  dueAt: string | null;
}

/** Reader view of the current survey (viewer Survey card + answer sheet). */
export interface MySurveyDto {
  id: string;
  title: string;
  intro: string | null;
  isMandatory: boolean;
  allowAnonymous: boolean;
  status: SurveyStatusValue;
  questions: SurveyQuestionDto[];
  myStatus: MySurveyStatus;
  dueAt: string | null;
  /** The reader is in the document's audience (others may look but not answer). */
  assigned: boolean;
  /** The reader opened the current version (required before answering); always true when there is no file. */
  openedCurrentVersion: boolean;
  /** The reader's own receipt. `anonymous` is only ever told to the reader themselves. */
  answered: { answeredAt: string; anonymous: boolean } | null;
}

export interface SurveyAnswerResult {
  surveyId: string;
  /** false when an existing participation was returned (double submit / offline replay). */
  created: boolean;
  answeredAt: string;
}

export interface SurveyOptionResult {
  label: string;
  count: number;
  percent: number;
}

export interface SurveyTextAnswerDto {
  text: string;
  /** null = "Anonymous". Named answers carry the date and version; anonymous ones never do. */
  respondent: NamedRef | null;
  submittedOn: string | null;
  documentVersionNumber: number | null;
}

export interface SurveyQuestionResult {
  id: string;
  position: number;
  type: SurveyQuestionTypeValue;
  label: string;
  required: boolean;
  /** Visible responses that answered this question (the % base). */
  answered: number;
  options: SurveyOptionResult[];
  /** First text answers (TEXT only) – more via the text-answers endpoint. */
  textAnswers: SurveyTextAnswerDto[];
}

export interface SurveyResultsDto {
  survey: { id: string; title: string; status: SurveyStatusValue; isMandatory: boolean; allowAnonymous: boolean; createdAt: string; replacedAt: string | null };
  totals: {
    /** People who took part (participation; includes anonymous answers that are not shown yet). */
    participants: number;
    /** Active people in the document's audience. */
    audience: number;
    /** Audience members who answered. */
    answeredInAudience: number;
    answerRate: number;
    /** Mandatory surveys: audience members still to answer. */
    notAnswered: number | null;
    /** Responses included in the per-question results. */
    shownResponses: number;
    namedResponses: number;
    anonymousShown: number;
  };
  anonymity: { threshold: number; hidden: number; notice: string | null };
  questions: SurveyQuestionResult[];
}

export interface SurveyParticipantRow {
  userId: string;
  name: string;
  email: string;
  department: NamedRef | null;
  location: NamedRef | null;
  /** Date the person took part (null = not answered). Never says whether they answered anonymously. */
  answeredAt: string | null;
}

export interface SurveyParticipationDto extends Paginated<SurveyParticipantRow> {
  counts: { audience: number; answered: number; notAnswered: number };
}
