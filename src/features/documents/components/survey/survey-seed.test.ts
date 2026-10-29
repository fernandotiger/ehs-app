import { describe, expect, it } from "vitest";
import { sanitiseSnapshot } from "@/lib/favourites/snapshot";
import { EMPTY_AUDIENCE } from "@/lib/validation/documents";
import type { SurveyDraft } from "../../survey-format";
import { mergeSurvey, pickSurvey, type SurveySettingsValues } from "./survey-seed";

const blank = (): SurveyDraft => ({
  title: "",
  intro: "",
  isMandatory: false,
  dueDays: 14,
  allowAnonymous: true,
  questions: [{ key: "q-blank", type: "SINGLE", label: "", help: "", required: true, options: [{ key: "o1", value: "" }, { key: "o2", value: "" }] }],
});
const freshSettings = (): SurveySettingsValues => ({
  audience: EMPTY_AUDIENCE,
  ack: { requiresAcknowledgement: false, ackDueDays: 14, reminderIntervalDays: 7, escalationDays: 21, escalationTarget: "MANAGER" },
});

const draft: SurveyDraft = {
  title: "Site induction – Cork",
  intro: "A few questions after your first walk-round.",
  isMandatory: true,
  dueDays: 5,
  allowAnonymous: false,
  questions: [
    { key: "q1", type: "SINGLE", label: "Do you know where the muster point is?", help: "", required: true, options: [{ key: "a", value: "Yes" }, { key: "b", value: "No" }] },
    { key: "q2", type: "TEXT", label: "Anything unclear?", help: "Optional", required: false, options: [] },
  ],
};
const settings: SurveySettingsValues = {
  audience: { ...EMPTY_AUDIENCE, siteIds: ["site-cork"] },
  ack: { requiresAcknowledgement: true, ackDueDays: 3, reminderIntervalDays: 1, escalationDays: 7, escalationTarget: "NONE" },
};

describe("pickSurvey", () => {
  it("keeps the settings, the questions as drafted and the audience", () => {
    expect(pickSurvey(draft, blank(), settings, freshSettings())).toEqual({
      title: "Site induction – Cork",
      intro: "A few questions after your first walk-round.",
      isMandatory: true,
      dueDays: 5,
      allowAnonymous: false,
      audience: settings.audience,
      ack: settings.ack,
      questions: [
        { type: "SINGLE", label: "Do you know where the muster point is?", help: "", required: true, options: ["Yes", "No"] },
        { type: "TEXT", label: "Anything unclear?", help: "Optional", required: false, options: [] },
      ],
    });
  });

  it("keeps nothing for an untouched page (question keys don't count)", () => {
    expect(sanitiseSnapshot(pickSurvey({ ...blank(), questions: [{ ...blank().questions[0]!, key: "other" }] }, blank(), freshSettings(), freshSettings()))).toBeNull();
  });
});

describe("mergeSurvey", () => {
  const seed = sanitiseSnapshot(pickSurvey(draft, blank(), settings, freshSettings()))!;

  it("restores settings and questions with fresh keys; confirming the file stays off (no file is kept)", () => {
    const merged = mergeSurvey({ draft: blank(), settings: freshSettings() }, seed);
    expect(merged.ackKept).toBe(true);
    expect(merged.settings).toEqual({ audience: settings.audience, ack: { ...settings.ack, requiresAcknowledgement: false } });
    const plain = merged.draft.questions.map((q) => ({ type: q.type, label: q.label, help: q.help, required: q.required, options: q.options.map((o) => o.value) }));
    expect({ ...merged.draft, questions: plain }).toEqual({
      ...draft,
      questions: [
        { type: "SINGLE", label: "Do you know where the muster point is?", help: "", required: true, options: ["Yes", "No"] },
        { type: "TEXT", label: "Anything unclear?", help: "Optional", required: false, options: [] },
      ],
    });
    expect(new Set(merged.draft.questions.map((q) => q.key)).size).toBe(2);
  });

  it("skips broken questions, pads choice questions to two options and caps lengths", () => {
    const merged = mergeSurvey({ draft: blank(), settings: freshSettings() }, {
      questions: [{ type: "ESSAY", label: "x" }, { type: "MULTIPLE", label: "Pick", options: ["Only one"] }, "nonsense"],
      dueDays: 0,
      title: "t".repeat(500),
    });
    expect(merged.draft.questions).toHaveLength(1);
    expect(merged.draft.questions[0]!.options.map((o) => o.value)).toEqual(["Only one", ""]);
    expect(merged.draft.dueDays).toBe(14);
    expect(merged.draft.title).toHaveLength(200);
    expect(merged.ackKept).toBe(false);
  });

  it("an empty seed gives the fresh page", () => {
    const fresh = { draft: blank(), settings: freshSettings() };
    expect(mergeSurvey(fresh, {})).toEqual({ ...fresh, ackKept: false });
  });
});
