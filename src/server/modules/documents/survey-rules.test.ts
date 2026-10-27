import { describe, expect, it } from "vitest";
import { surveyDefinitionSchema, type SurveyDefinitionInput } from "@/lib/validation/document-surveys";
import { csvRow } from "./csv";
import {
  anonymityNotice,
  anonymousAnswersVisible,
  answerBlockReason,
  dateOnly,
  estimatedMinutes,
  isSurveyActionRequired,
  normaliseQuestions,
  questionsChanged,
  readerSurveyStatus,
  surveyDefinitionIssues,
  surveyDueDate,
  surveyEditProblem,
  surveyExportCells,
  surveyExportHeader,
  surveyRequiredSince,
  surveyTransitionProblem,
  validateAnswers,
  visibleResponseCounts,
  type StoredSurveyQuestion,
} from "./survey-rules";

const definition = (overrides: Partial<SurveyDefinitionInput> = {}): SurveyDefinitionInput => ({
  title: "Questions about the Fire Safety Policy",
  intro: "",
  isMandatory: true,
  dueDays: 14,
  allowAnonymous: true,
  questions: [
    { type: "SINGLE", label: "Did you understand this document?", help: "", required: true, options: ["Yes", "Partly", "No"] },
    { type: "TEXT", label: "What was unclear?", help: "", required: false, options: [] },
  ],
  ...overrides,
});

const QUESTIONS: StoredSurveyQuestion[] = [
  { id: "q1", type: "SINGLE", label: "Clear?", help: null, required: true, options: ["Very clear", "Clear", "Not clear"] },
  { id: "q2", type: "MULTIPLE", label: "Useful parts?", help: null, required: false, options: ["Assembly points", "Fire wardens", "Alarms"] },
  { id: "q3", type: "TEXT", label: "Suggestions?", help: null, required: true, options: [] },
];

describe("survey definition", () => {
  it("accepts the understanding-check example", () => {
    expect(surveyDefinitionSchema.safeParse(definition()).success).toBe(true);
  });

  it("needs 1–20 questions", () => {
    expect(surveyDefinitionSchema.safeParse(definition({ questions: [] })).success).toBe(false);
    const many = Array.from({ length: 21 }, () => ({ type: "TEXT" as const, label: "Q", help: "", required: true, options: [] }));
    expect(surveyDefinitionSchema.safeParse(definition({ questions: many })).success).toBe(false);
    expect(surveyDefinitionSchema.safeParse(definition({ questions: many.slice(0, 20) })).success).toBe(true);
  });

  it("needs 2–20 unique, filled-in options for choice questions", () => {
    const one = definition({ questions: [{ type: "SINGLE", label: "Q", help: "", required: true, options: ["Only"] }] });
    expect(surveyDefinitionIssues(one)).toEqual([{ path: "questions.0.options", message: "Add at least 2 options" }]);

    const dup = definition({ questions: [{ type: "MULTIPLE", label: "Q", help: "", required: true, options: ["Yes", " yes ", ""] }] });
    expect(surveyDefinitionIssues(dup).map((i) => i.path)).toEqual(["questions.0.options.1", "questions.0.options.2"]);
    expect(surveyDefinitionSchema.safeParse(dup).success).toBe(false);

    const tooMany = definition({ questions: [{ type: "SINGLE", label: "Q", help: "", required: true, options: Array.from({ length: 21 }, (_, i) => `O${i}`) }] });
    expect(surveyDefinitionSchema.safeParse(tooMany).success).toBe(false);
  });

  it("ignores options on text questions and trims everything", () => {
    const text = definition({ questions: [{ type: "TEXT", label: "  Anything else?  ", help: "  ", required: false, options: ["left over", ""] }] });
    expect(surveyDefinitionIssues(text)).toEqual([]);
    expect(normaliseQuestions(text.questions)).toEqual([{ type: "TEXT", label: "Anything else?", help: null, required: false, options: [] }]);
  });

  it("needs a title and a question label", () => {
    expect(surveyDefinitionSchema.safeParse(definition({ title: "  " })).success).toBe(false);
    const noLabel = definition({ questions: [{ type: "TEXT", label: " ", help: "", required: true, options: [] }] });
    expect(surveyDefinitionSchema.safeParse(noLabel).success).toBe(false);
  });
});

describe("answer validation", () => {
  it("accepts valid answers and keeps the survey's option order", () => {
    const result = validateAnswers(QUESTIONS, [
      { questionId: "q1", choices: ["Clear"] },
      { questionId: "q2", choices: ["Alarms", "Assembly points"] },
      { questionId: "q3", text: "  More drills please  " },
    ]);
    expect(result).toEqual({
      ok: true,
      answers: [
        { questionId: "q1", text: null, choices: ["Clear"] },
        { questionId: "q2", text: null, choices: ["Assembly points", "Alarms"] },
        { questionId: "q3", text: "More drills please", choices: [] },
      ],
    });
  });

  it("leaves unanswered optional questions out", () => {
    const result = validateAnswers(QUESTIONS, [
      { questionId: "q1", choices: ["Clear"] },
      { questionId: "q3", text: "ok" },
    ]);
    expect(result.ok && result.answers.map((a) => a.questionId)).toEqual(["q1", "q3"]);
  });

  it("requires answers to required questions", () => {
    const result = validateAnswers(QUESTIONS, [{ questionId: "q3", text: "   " }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.questionId)).toEqual(["q1", "q3"]);
  });

  it("allows one choice for One choice, only listed options, and text only for text answers", () => {
    const two = validateAnswers(QUESTIONS, [{ questionId: "q1", choices: ["Clear", "Not clear"] }, { questionId: "q3", text: "x" }]);
    expect(!two.ok && two.issues[0]!.message).toBe("Choose only one option.");
    const unknown = validateAnswers(QUESTIONS, [{ questionId: "q1", choices: ["Maybe"] }, { questionId: "q3", text: "x" }]);
    expect(unknown.ok).toBe(false);
    const textOnChoice = validateAnswers(QUESTIONS, [{ questionId: "q1", choices: ["Clear"], text: "hi" }, { questionId: "q3", text: "x" }]);
    expect(textOnChoice.ok).toBe(false);
    const choiceOnText = validateAnswers(QUESTIONS, [{ questionId: "q1", choices: ["Clear"] }, { questionId: "q3", text: "x", choices: ["Clear"] }]);
    expect(choiceOnText.ok).toBe(false);
  });

  it("rejects unknown and duplicate questions and over-long text", () => {
    expect(validateAnswers(QUESTIONS, [{ questionId: "q1", choices: ["Clear"] }, { questionId: "q3", text: "x" }, { questionId: "zz", text: "x" }]).ok).toBe(false);
    expect(validateAnswers(QUESTIONS, [{ questionId: "q1", choices: ["Clear"] }, { questionId: "q1", choices: ["Clear"] }, { questionId: "q3", text: "x" }]).ok).toBe(false);
    expect(validateAnswers(QUESTIONS, [{ questionId: "q1", choices: ["Clear"] }, { questionId: "q3", text: "x".repeat(2001) }]).ok).toBe(false);
    expect(validateAnswers(QUESTIONS, [{ questionId: "q1", choices: ["Clear"] }, { questionId: "q3", text: "x".repeat(2000) }]).ok).toBe(true);
  });

  it("de-duplicates repeated choices", () => {
    const result = validateAnswers(QUESTIONS, [{ questionId: "q1", choices: ["Clear", "Clear"] }, { questionId: "q3", text: "x" }]);
    expect(result.ok && result.answers[0]!.choices).toEqual(["Clear"]);
  });
});

describe("lock rules", () => {
  const base = { status: "ACTIVE" as const, allowAnonymousBefore: true, allowAnonymousAfter: true, questionsChanged: false, responseCount: 0, anonymousCount: 0 };

  it("allows any edit before the first answer", () => {
    expect(surveyEditProblem({ ...base, questionsChanged: true, allowAnonymousAfter: false })).toBeNull();
  });

  it("locks the questions once the first answer arrives", () => {
    expect(surveyEditProblem({ ...base, questionsChanged: true, responseCount: 1 })).toMatch(/Replace survey/);
    expect(surveyEditProblem({ ...base, responseCount: 5 })).toBeNull();
  });

  it("never switches anonymity off once anonymous answers exist (off → on is fine)", () => {
    expect(surveyEditProblem({ ...base, allowAnonymousAfter: false, responseCount: 3, anonymousCount: 1 })).toMatch(/anonymous/);
    expect(surveyEditProblem({ ...base, allowAnonymousAfter: false, responseCount: 3, anonymousCount: 0 })).toBeNull();
    expect(surveyEditProblem({ ...base, allowAnonymousBefore: false, allowAnonymousAfter: true, responseCount: 3 })).toBeNull();
  });

  it("keeps replaced surveys read-only and guards close / reopen", () => {
    expect(surveyEditProblem({ ...base, status: "REPLACED" })).toMatch(/replaced/);
    expect(surveyTransitionProblem("ACTIVE", "close")).toBeNull();
    expect(surveyTransitionProblem("CLOSED", "close")).toMatch(/already closed/);
    expect(surveyTransitionProblem("CLOSED", "reopen")).toBeNull();
    expect(surveyTransitionProblem("ACTIVE", "reopen")).toMatch(/already open/);
    expect(surveyTransitionProblem("REPLACED", "reopen")).toMatch(/replaced/);
  });

  it("detects question changes (text, help, required, options, order, type)", () => {
    const qs = normaliseQuestions(definition().questions);
    expect(questionsChanged(qs, normaliseQuestions(definition().questions))).toBe(false);
    expect(questionsChanged(qs, [qs[1]!, qs[0]!])).toBe(true);
    expect(questionsChanged(qs, [{ ...qs[0]!, options: ["Yes", "No", "Partly"] }, qs[1]!])).toBe(true);
    expect(questionsChanged(qs, [{ ...qs[0]!, required: false }, qs[1]!])).toBe(true);
    expect(questionsChanged(qs, [qs[0]!, { ...qs[1]!, help: "Be specific" }])).toBe(true);
    expect(questionsChanged(qs, [qs[0]!])).toBe(true);
  });
});

describe("can-answer guard", () => {
  const ok = { documentStatus: "PUBLISHED", surveyStatus: "ACTIVE" as const, assigned: true, opened: true, anonymousRequested: false, allowAnonymous: true };

  it("lets an assigned reader answer after opening the document", () => {
    expect(answerBlockReason(ok)).toBeNull();
    expect(answerBlockReason({ ...ok, anonymousRequested: true })).toBeNull();
  });

  it("explains every block in plain words", () => {
    expect(answerBlockReason({ ...ok, opened: false })).toBe("Please open the document before answering the survey.");
    expect(answerBlockReason({ ...ok, documentStatus: "DRAFT" })).toMatch(/not published/);
    expect(answerBlockReason({ ...ok, surveyStatus: "CLOSED" })).toBe("This survey is closed.");
    expect(answerBlockReason({ ...ok, surveyStatus: "REPLACED" })).toMatch(/replaced/);
    expect(answerBlockReason({ ...ok, assigned: false })).toMatch(/assigned/);
    expect(answerBlockReason({ ...ok, anonymousRequested: true, allowAnonymous: false })).toMatch(/anonymous/);
  });
});

describe("k-anonymity threshold", () => {
  it("hides anonymous answers until at least k exist", () => {
    expect(anonymousAnswersVisible(0, 3)).toBe(false);
    expect(anonymousAnswersVisible(2, 3)).toBe(false);
    expect(anonymousAnswersVisible(3, 3)).toBe(true);
    expect(anonymousAnswersVisible(1, 1)).toBe(true);
  });

  it("leaves hidden anonymous answers out of every count", () => {
    expect(visibleResponseCounts({ named: 10, anonymous: 2 }, 3)).toEqual({ named: 10, anonymous: 0, hiddenAnonymous: 2, visible: 10, anonymousVisible: false });
    expect(visibleResponseCounts({ named: 10, anonymous: 3 }, 3)).toEqual({ named: 10, anonymous: 3, hiddenAnonymous: 0, visible: 13, anonymousVisible: true });
  });

  it("explains what is hidden", () => {
    expect(anonymityNotice(2, 3)).toBe("2 anonymous answers will show once there are at least 3.");
    expect(anonymityNotice(1, 5)).toBe("1 anonymous answer will show once there are at least 5.");
    expect(anonymityNotice(3, 3)).toBeNull();
    expect(anonymityNotice(0, 3)).toBeNull();
  });
});

describe("reader status and due dates", () => {
  const now = new Date("2026-03-20T10:00:00Z");

  it("derives ANSWERED / CLOSED / OPTIONAL / REQUIRED / OVERDUE", () => {
    const base = { surveyStatus: "ACTIVE" as const, isMandatory: true, answered: false, dueAt: new Date("2026-03-25T00:00:00Z"), now };
    expect(readerSurveyStatus({ ...base, answered: true, surveyStatus: "CLOSED" })).toBe("ANSWERED");
    expect(readerSurveyStatus({ ...base, surveyStatus: "CLOSED" })).toBe("CLOSED");
    expect(readerSurveyStatus({ ...base, isMandatory: false })).toBe("OPTIONAL");
    expect(readerSurveyStatus(base)).toBe("REQUIRED");
    expect(readerSurveyStatus({ ...base, dueAt: new Date("2026-03-19T00:00:00Z") })).toBe("OVERDUE");
    expect(isSurveyActionRequired("REQUIRED")).toBe(true);
    expect(isSurveyActionRequired("OVERDUE")).toBe(true);
    expect(isSurveyActionRequired("OPTIONAL")).toBe(false);
  });

  it("starts the clock at the latest of publication, becoming mandatory and joining", () => {
    const publishedAt = new Date("2026-03-01T09:00:00Z");
    const surveyCreatedAt = new Date("2026-02-20T09:00:00Z");
    expect(surveyRequiredSince({ publishedAt: null, mandatorySince: null, surveyCreatedAt })).toBeNull();
    expect(surveyRequiredSince({ publishedAt, mandatorySince: null, surveyCreatedAt })).toEqual(publishedAt);
    const later = new Date("2026-03-10T09:00:00Z");
    expect(surveyRequiredSince({ publishedAt, mandatorySince: later, surveyCreatedAt })).toEqual(later);
    const joined = new Date("2026-03-15T09:00:00Z");
    expect(surveyRequiredSince({ publishedAt, mandatorySince: later, surveyCreatedAt, userCreatedAt: joined })).toEqual(joined);
    expect(surveyDueDate(publishedAt, 14)).toEqual(new Date("2026-03-15T09:00:00Z"));
    expect(surveyDueDate(null, 14)).toBeNull();
  });

  it("estimates the time in whole minutes (at least 1) and stores dates without a time", () => {
    expect(estimatedMinutes([{ type: "SINGLE" }, { type: "TEXT" }])).toBe(1);
    expect(estimatedMinutes(Array.from({ length: 6 }, () => ({ type: "TEXT" as const })))).toBe(4);
    expect(dateOnly("2026-03-12").toISOString()).toBe("2026-03-12T00:00:00.000Z");
  });
});

describe("survey CSV export", () => {
  const questions = [
    { id: "q1", position: 1, type: "SINGLE" as const, label: "=Clear?" },
    { id: "q2", position: 2, type: "MULTIPLE" as const, label: "Useful parts?" },
    { id: "q3", position: 3, type: "TEXT" as const, label: "Suggestions?" },
  ];
  const answers = [
    { questionId: "q1", text: null, choices: ["Clear"] },
    { questionId: "q2", text: null, choices: ["Assembly points", "Alarms"] },
    { questionId: "q3", text: "=HYPERLINK(\"http://evil\")", choices: [] },
  ];

  it("writes one header column per question (numbered, so a label can never start a formula)", () => {
    expect(csvRow(surveyExportHeader(questions))).toBe("Respondent,Email,Department,Answered on,Document version,Q1. =Clear?,Q2. Useful parts?,Q3. Suggestions?\r\n");
  });

  it("names named respondents and escapes formula-leading answers", () => {
    const row = surveyExportCells(
      { isAnonymous: false, submittedOn: new Date("2026-03-12T00:00:00Z"), documentVersionNumber: 2, respondent: { name: "Helen Hughes", email: "helen@x", department: { name: "HR" } }, answers },
      questions,
    );
    expect(row).toEqual(["Helen Hughes", "helen@x", "HR", "2026-03-12", 2, "Clear", "Assembly points; Alarms", "=HYPERLINK(\"http://evil\")"]);
    expect(csvRow(row)).toBe("Helen Hughes,helen@x,HR,2026-03-12,2,Clear,Assembly points; Alarms,\"'=HYPERLINK(\"\"http://evil\"\")\"\r\n");
  });

  it("leaves the version empty when the survey had no file", () => {
    const row = surveyExportCells(
      { isAnonymous: false, submittedOn: new Date("2026-03-12T00:00:00Z"), documentVersionNumber: null, respondent: { name: "Helen Hughes", email: "helen@x", department: null }, answers: answers.slice(0, 1) },
      questions,
    );
    expect(csvRow(row)).toBe("Helen Hughes,helen@x,,2026-03-12,,Clear,,\r\n");
  });

  it("never writes who, when or which version for anonymous rows", () => {
    const row = surveyExportCells(
      { isAnonymous: true, submittedOn: new Date("2026-03-12T00:00:00Z"), documentVersionNumber: 2, respondent: null, answers: answers.slice(0, 1) },
      questions,
    );
    expect(row).toEqual(["Anonymous", null, null, null, null, "Clear", null, null]);
    expect(csvRow(row)).toBe("Anonymous,,,,,Clear,,\r\n");
  });
});
