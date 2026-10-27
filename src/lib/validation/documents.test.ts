import { describe, expect, it } from "vitest";
import { ACK_NEEDS_FILE, createSurveyDocumentSchema, EMPTY_AUDIENCE, libraryQuerySchema, mySurveysQuerySchema } from "./documents";

const survey = {
  title: "Manual handling check",
  intro: "",
  isMandatory: false,
  dueDays: 14,
  allowAnonymous: true,
  questions: [{ type: "SINGLE" as const, label: "Did you understand it?", help: "", required: true, options: ["Yes", "No"] }],
};
const ack = { requiresAcknowledgement: false, ackDueDays: 14, reminderIntervalDays: 7, escalationDays: 7, escalationTarget: "MANAGER" as const };
const valid = { survey, audience: { ...EMPTY_AUDIENCE, allEmployees: true }, ack, uploadId: "ckupload000000000000000001", publish: true };

describe("Survey page payload", () => {
  it("needs a survey, an audience and acknowledgement settings – no document details", () => {
    expect(createSurveyDocumentSchema.safeParse(valid).success).toBe(true);
    for (const key of ["survey", "audience", "ack"] as const) {
      expect(createSurveyDocumentSchema.safeParse({ ...valid, [key]: undefined }).success, key).toBe(false);
    }
  });

  it("makes the file optional, but acknowledgement needs one", () => {
    expect(createSurveyDocumentSchema.safeParse({ ...valid, uploadId: null }).success).toBe(true);
    expect(createSurveyDocumentSchema.safeParse({ ...valid, uploadId: undefined }).success).toBe(true);
    const withAck = { ...valid, ack: { ...ack, requiresAcknowledgement: true } };
    expect(createSurveyDocumentSchema.safeParse(withAck).success).toBe(true);
    const noFile = createSurveyDocumentSchema.safeParse({ ...withAck, uploadId: null });
    expect(noFile.success).toBe(false);
    expect(noFile.error?.issues[0]).toMatchObject({ message: ACK_NEEDS_FILE, path: ["ack", "requiresAcknowledgement"] });
  });

  it("rejects an empty audience and an invalid survey", () => {
    expect(createSurveyDocumentSchema.safeParse({ ...valid, audience: EMPTY_AUDIENCE }).success).toBe(false);
    expect(createSurveyDocumentSchema.safeParse({ ...valid, survey: { ...survey, title: "" } }).success).toBe(false);
    expect(createSurveyDocumentSchema.safeParse({ ...valid, survey: { ...survey, questions: [] } }).success).toBe(false);
  });
});

describe("Library and My Surveys queries", () => {
  it("lists documents unless the Survey Library asks for surveys", () => {
    expect(libraryQuerySchema.parse({}).type).toBe("document");
    expect(libraryQuerySchema.parse({ type: "survey", createdBy: "me" })).toMatchObject({ type: "survey", createdBy: "me" });
    expect(libraryQuerySchema.safeParse({ type: "other" }).success).toBe(false);
    expect(libraryQuerySchema.safeParse({ createdBy: "someone" }).success).toBe(false);
  });

  it("filters My Surveys by all | todo | answered", () => {
    expect(mySurveysQuerySchema.parse({}).filter).toBe("all");
    expect(mySurveysQuerySchema.parse({ filter: "todo" }).filter).toBe("todo");
    expect(mySurveysQuerySchema.safeParse({ filter: "acknowledged" }).success).toBe(false);
  });
});
