import { describe, expect, it } from "vitest";
import { formOverdueCutoff, tallyLibrarySummary, type LibraryFormFacts } from "./library-summary-rules";
import { readerSurveyStatus, surveyDueDate, surveyRequiredSince } from "./survey-rules";

const form = (facts: Partial<LibraryFormFacts>): LibraryFormFacts => ({ open: true, hasAudience: true, someoneNotCompleted: false, someoneOverdue: false, ackOutstanding: false, ackOverdue: false, ...facts });

describe("Document Library banner – documents", () => {
  it("counts documents with someone still to acknowledge and with someone overdue; the total is passed through", () => {
    const summary = tallyLibrarySummary({
      documentCount: 7,
      documents: [
        { someoneOutstanding: true, someoneOverdue: true },
        { someoneOutstanding: true, someoneOverdue: false },
        { someoneOutstanding: false, someoneOverdue: false },
      ],
      forms: [],
    });
    expect(summary.documents).toEqual({ toDo: 2, overdue: 1, total: 7 });
  });
});

describe("Document Library banner – response forms", () => {
  it("To complete = open forms someone has not completed; closed ones are not to complete any more", () => {
    const summary = tallyLibrarySummary({
      documentCount: 0,
      documents: [],
      forms: [form({ someoneNotCompleted: true }), form({ someoneNotCompleted: true, open: false }), form({})],
    });
    expect(summary.forms.toComplete).toBe(1);
  });

  it("Overdue = open forms with someone past the deadline", () => {
    const summary = tallyLibrarySummary({
      documentCount: 0,
      documents: [],
      forms: [form({ someoneNotCompleted: true, someoneOverdue: true }), form({ someoneNotCompleted: true, someoneOverdue: true, open: false }), form({ someoneNotCompleted: true })],
    });
    expect(summary.forms.overdue).toBe(1);
  });

  it("counts an acknowledgement still to give on the form's file as To complete / Overdue, like My Response Forms", () => {
    const summary = tallyLibrarySummary({
      documentCount: 0,
      documents: [],
      forms: [form({ ackOutstanding: true, ackOverdue: true }), form({ ackOutstanding: true })],
    });
    expect(summary.forms).toEqual({ toComplete: 2, overdue: 1, completed: 0 });
  });

  it("Completed = everyone in the audience has completed it (open or closed); an empty audience never counts", () => {
    const summary = tallyLibrarySummary({
      documentCount: 0,
      documents: [],
      forms: [form({}), form({ open: false }), form({ someoneNotCompleted: true }), form({ hasAudience: false })],
    });
    expect(summary.forms.completed).toBe(2);
  });
});

describe("formOverdueCutoff", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-10-30T12:00:00Z");
  const base = { isMandatory: true, open: true, publishedAt: new Date(now.getTime() - 30 * day), mandatorySince: null, createdAt: new Date(now.getTime() - 40 * day), dueDays: 14 };

  it("is null for optional, closed or unpublished forms and while the deadline has not passed for anyone", () => {
    expect(formOverdueCutoff({ ...base, isMandatory: false }, now)).toBeNull();
    expect(formOverdueCutoff({ ...base, open: false }, now)).toBeNull();
    expect(formOverdueCutoff({ ...base, publishedAt: null }, now)).toBeNull();
    expect(formOverdueCutoff({ ...base, mandatorySince: new Date(now.getTime() - 3 * day) }, now)).toBeNull();
  });

  it("agrees with each person's own Overdue status (joined before the cutoff ⇔ overdue)", () => {
    const cutoff = formOverdueCutoff(base, now);
    expect(cutoff).not.toBeNull();
    for (const joinedDaysAgo of [100, 20, 15, 14, 13, 1]) {
      const userCreatedAt = new Date(now.getTime() - joinedDaysAgo * day + 60_000);
      const dueAt = surveyDueDate(surveyRequiredSince({ publishedAt: base.publishedAt, mandatorySince: null, surveyCreatedAt: base.createdAt, userCreatedAt }), base.dueDays);
      const overdue = readerSurveyStatus({ surveyStatus: "ACTIVE", isMandatory: true, answered: false, dueAt, now }) === "OVERDUE";
      expect(userCreatedAt.getTime() < cutoff!.getTime(), `joined ${joinedDaysAgo} days ago`).toBe(overdue);
    }
  });
});
