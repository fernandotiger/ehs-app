import { overdueCreatedBefore } from "./acknowledgement-rules";
import { surveyRequiredSince } from "./survey-rules";

/**
 * Document Library banner numbers (owner's request, 30 Oct 2026) – pure rules. Each number counts documents or response
 * forms of the library's default view (Active = published + drafts), never people, and never depends on the table's
 * search or filters. Facts per row come from SQL (library-summary in document-query.service.ts); the tally lives here.
 */

/** A published document that tracks acknowledgements. */
export interface LibraryDocumentFacts {
  /** Someone in the audience still has to acknowledge the required version (the row's "outstanding" > 0). */
  someoneOutstanding: boolean;
  /** Someone is past their acknowledgement deadline (the row's "overdue" > 0). */
  someoneOverdue: boolean;
}

/** A published response form (its current survey). */
export interface LibraryFormFacts {
  /** Still accepting answers (not closed). */
  open: boolean;
  /** At least one person is in its audience. */
  hasAudience: boolean;
  /** Someone in the audience has not completed it (the page's "Not completed" > 0). */
  someoneNotCompleted: boolean;
  /** Everyone must complete it and someone who has not is past the deadline. */
  someoneOverdue: boolean;
  /** Its file must be acknowledged and someone still has to (My Response Forms counts that as "To complete" too). */
  ackOutstanding: boolean;
  /** Someone is past the acknowledgement deadline of its file (counted as "Overdue" on My Response Forms too). */
  ackOverdue: boolean;
}

export interface LibrarySummary {
  documents: {
    /** Published documents that still have people who must acknowledge them. */
    toDo: number;
    /** Published documents where someone is past the acknowledgement deadline. */
    overdue: number;
    /** Active documents in the library (published + drafts) – the Documents tab's default total. */
    total: number;
  };
  forms: {
    /** Published, open response forms someone in their audience still has to complete (or acknowledge, when required). */
    toComplete: number;
    /** Open response forms where someone is past the deadline to complete it or to acknowledge its file. */
    overdue: number;
    /** Published response forms everyone in their audience has completed (and acknowledged, when required) – open or closed. */
    completed: number;
  };
}

export function tallyLibrarySummary(input: { documentCount: number; documents: LibraryDocumentFacts[]; forms: LibraryFormFacts[] }): LibrarySummary {
  const count = <T>(rows: T[], test: (row: T) => boolean) => rows.reduce((n, row) => n + (test(row) ? 1 : 0), 0);
  return {
    documents: {
      toDo: count(input.documents, (d) => d.someoneOutstanding),
      overdue: count(input.documents, (d) => d.someoneOverdue),
      total: input.documentCount,
    },
    forms: {
      toComplete: count(input.forms, (f) => f.open && (f.someoneNotCompleted || f.ackOutstanding)),
      overdue: count(input.forms, (f) => f.open && (f.someoneOverdue || f.ackOverdue)),
      completed: count(input.forms, (f) => f.hasAudience && !f.someoneNotCompleted && !f.ackOutstanding),
    },
  };
}

/**
 * People who joined before the returned date and have not completed the form are overdue (null = nobody can be yet).
 * Same rule as each person's own due date: max(published, became mandatory, joined) + "complete within" days.
 */
export function formOverdueCutoff(
  form: { isMandatory: boolean; open: boolean; publishedAt: Date | null; mandatorySince: Date | null; createdAt: Date; dueDays: number },
  now: Date,
): Date | null {
  if (!form.isMandatory || !form.open) return null;
  const since = surveyRequiredSince({ publishedAt: form.publishedAt, mandatorySince: form.mandatorySince, surveyCreatedAt: form.createdAt });
  return overdueCreatedBefore(since, form.dueDays, now);
}
