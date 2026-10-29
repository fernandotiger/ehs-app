import { describe, expect, it } from "vitest";
import { sanitiseSnapshot } from "@/lib/favourites/snapshot";
import type { FormFieldDefinition } from "@/lib/forms";
import { defaultRiskSettings } from "@/lib/forms/settings";
import { mergeAssessment, pickAssessment, type AssessmentMergeContext } from "./assessment-seed";
import type { AssessmentWizardValues } from "./assessment-wizard";
import type { HazardDraft } from "./hazard-editor";

const blankHazard = (key = "h0"): HazardDraft => ({ key, activity: "", name: "", consequence: "", controls: "", recommendation: "", justification: "", likelihood: null, severity: null, factors: {}, checklistResult: null });

function fresh(): AssessmentWizardValues {
  return {
    formVersionId: null,
    title: "",
    description: "",
    departmentId: null,
    ownerId: "u-me",
    approverId: null,
    reviewDate: "",
    reviewTouched: false,
    participantIds: [],
    itemType: null,
    itemIdentity: "",
    operationMode: null,
    workArea: null,
    peopleExposed: "",
    impactContext: "",
    isConfidential: false,
    hazards: [blankHazard()],
    answers: {},
  };
}

const fields: FormFieldDefinition[] = [
  { key: "shiftPattern", label: "Shift pattern", type: "text" },
  { key: "lastReviewed", label: "Last reviewed", type: "date" },
  { key: "drawing", label: "Drawing", type: "file" },
];

const settings = (reviewMonths: number): Record<string, unknown> => ({ ...defaultRiskSettings("5x5"), reviewMonths });
const context: AssessmentMergeContext = {
  forms: [{ formId: "f-55", versionId: "v-55-2", settings: settings(12) }],
  today: "2026-10-29",
  departmentIds: ["dep-yard"],
};

const typed: AssessmentWizardValues = {
  ...fresh(),
  formVersionId: "v-55-2",
  title: "Forklift movement in the loading bay",
  description: "Loading and unloading trailers",
  departmentId: "dep-yard",
  approverId: "u-helen",
  reviewDate: "2027-03-01",
  reviewTouched: true,
  participantIds: ["u-liam", "u-sam"],
  itemType: "Vehicle",
  itemIdentity: "FLT-07",
  peopleExposed: "Drivers, visitors",
  isConfidential: true,
  hazards: [
    { ...blankHazard("h1"), id: "existing-hazard", activity: "Reversing", name: "Struck by vehicle", consequence: "Crush injury", controls: "Banksman", likelihood: 3, severity: 4 },
    blankHazard("h2"),
  ],
  answers: { shiftPattern: "Two shifts", lastReviewed: "2025-10-01", drawing: [{ uploadId: "up1", fileName: "bay.pdf" }] },
};

describe("pickAssessment", () => {
  it("keeps the scope, the hazards and text answers – never the review date, confidential, ids or files", () => {
    const seed = pickAssessment(typed, fresh(), { formId: "f-55", fields });
    expect(seed).toEqual({
      formVersionId: "v-55-2",
      formId: "f-55",
      title: "Forklift movement in the loading bay",
      description: "Loading and unloading trailers",
      departmentId: "dep-yard",
      approverId: "u-helen",
      participantIds: ["u-liam", "u-sam"],
      itemType: "Vehicle",
      itemIdentity: "FLT-07",
      peopleExposed: "Drivers, visitors",
      hazards: [
        { activity: "Reversing", name: "Struck by vehicle", consequence: "Crush injury", controls: "Banksman", recommendation: "", justification: "", likelihood: 3, severity: 4, factors: {}, checklistResult: null },
      ],
      answers: { shiftPattern: "Two shifts" },
    });
  });

  it("keeps nothing for an untouched form", () => {
    expect(sanitiseSnapshot(pickAssessment(fresh(), fresh(), { formId: null, fields: [] }))).toBeNull();
  });
});

describe("mergeAssessment", () => {
  const seed = sanitiseSnapshot(pickAssessment(typed, fresh(), { formId: "f-55", fields }))!;

  it("restores the scope and hazards with scores when the same form version is still published", () => {
    const values = mergeAssessment(fresh(), seed, context);
    expect(values).toMatchObject({
      formVersionId: "v-55-2",
      reviewDate: "2027-10-29",
      reviewTouched: false,
      title: "Forklift movement in the loading bay",
      departmentId: "dep-yard",
      ownerId: "u-me",
      approverId: "u-helen",
      participantIds: ["u-liam", "u-sam"],
      isConfidential: false,
      answers: { shiftPattern: "Two shifts" },
    });
    expect(values.hazards).toHaveLength(1);
    expect(values.hazards[0]).toMatchObject({ activity: "Reversing", name: "Struck by vehicle", likelihood: 3, severity: 4 });
    expect(values.hazards[0]!.id).toBeUndefined();
    expect(values.hazards[0]!.key).toEqual(expect.any(String));
  });

  it("a newer version of the same form keeps the form and hazard texts, but not answers or scores", () => {
    const values = mergeAssessment(fresh(), seed, { ...context, forms: [{ formId: "f-55", versionId: "v-55-3", settings: settings(6) }] });
    expect(values.formVersionId).toBe("v-55-3");
    expect(values.reviewDate).toBe("2027-04-29");
    expect(values.answers).toEqual({});
    expect(values.hazards[0]).toMatchObject({ name: "Struck by vehicle", likelihood: null, severity: null });
  });

  it("a form that is no longer published is dropped with its answers and scores", () => {
    const values = mergeAssessment(fresh(), seed, { ...context, forms: [] });
    expect(values.formVersionId).toBeNull();
    expect(values.reviewDate).toBe("");
    expect(values.answers).toEqual({});
    expect(values.hazards[0]).toMatchObject({ name: "Struck by vehicle", likelihood: null });
  });

  it("never brings back review dates, confidential or upload answers from a hand-made seed", () => {
    const values = mergeAssessment(fresh(), { ...seed, reviewDate: "2020-01-01", isConfidential: true, answers: { drawing: [{ uploadId: "u" }], shiftPattern: "x" } }, context);
    expect(values.reviewDate).toBe("2027-10-29");
    expect(values.isConfidential).toBe(false);
    expect(values.answers).toEqual({ shiftPattern: "x" });
  });

  it("an empty or broken seed gives the fresh form (one blank hazard)", () => {
    const values = mergeAssessment(fresh(), { hazards: "nope", departmentId: "dep-gone" }, context);
    expect(values).toEqual(fresh());
  });
});
