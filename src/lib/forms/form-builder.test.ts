import { describe, expect, it } from "vitest";
import {
  copyQuestion,
  defaultFormSettings,
  enforceSystemQuestions,
  fieldsForSite,
  incidentConflicts,
  incidentFieldConflict,
  initialFields,
  newField,
  normaliseLabel,
  repeatedDefaultKeys,
  reusableQuestionChoices,
  reuseConflict,
  systemQuestions,
  validateFormDesign,
  validateQuestionnaireAnswers,
  type FormDesign,
  type FormFieldDefinition,
} from "./index";

function reportDesign(extra: FormFieldDefinition[] = []): FormDesign {
  return { module: "incidents", purpose: "REPORT", fields: [...initialFields("incidents", "REPORT"), ...extra], settings: {} };
}

function investigationDesign(extra: FormFieldDefinition[] = []): FormDesign {
  return { module: "incidents", purpose: "INVESTIGATION", fields: [...initialFields("incidents", "INVESTIGATION"), ...extra], settings: {} };
}

const q = (key: string, label: string, type: FormFieldDefinition["type"] = "text", extra: Partial<FormFieldDefinition> = {}): FormFieldDefinition => ({ key, label, type, ...extra });

const conditionOptions = [
  { value: "good", label: "Good" },
  { value: "needs-attention", label: "Needs attention" },
  { value: "unsafe", label: "Unsafe" },
];

describe("F-01 create a report form", () => {
  it("starts with exactly the four mandatory Report questions", () => {
    const fields = initialFields("incidents", "REPORT");
    expect(fields.map((f) => f.label)).toEqual(["Incident title", "Date and time of event", "Site or location", "What happened?"]);
    expect(fields.every((f) => f.system && f.required)).toBe(true);
    expect(fields.find((f) => f.key === "whatHappened")!.type).toBe("textarea");
  });
  it("mandatory questions cannot be deleted, renamed or made optional (help text and order can change)", () => {
    const fields = initialFields("incidents", "REPORT");
    const edited = fields.map((f) => (f.key === "incidentTitle" ? { ...f, label: "Title", required: false, helpText: "Short summary" } : f)).reverse();
    const { fields: enforced, missing } = enforceSystemQuestions("incidents", "REPORT", {}, edited);
    expect(missing).toEqual([]);
    const title = enforced.find((f) => f.key === "incidentTitle")!;
    expect(title).toMatchObject({ label: "Incident title", required: true, helpText: "Short summary" });
    expect(enforced[0]!.key).toBe("whatHappened");

    const withoutTitle = fields.filter((f) => f.key !== "incidentTitle");
    expect(validateFormDesign({ ...reportDesign(), fields: withoutTitle }, { forPublish: false }).map((i) => i.message)).toContain('The required question "Incident title" cannot be removed.');
  });
  it("Investigation starts with findings and root cause analysis; Risk with its eight questions", () => {
    expect(initialFields("incidents", "INVESTIGATION").map((f) => f.label)).toEqual(["Investigation findings", "Root cause analysis"]);
    const risk = initialFields("risk", "5x5", defaultFormSettings("risk", "5x5"));
    expect(risk).toHaveLength(8);
    expect(risk.find((f) => f.key === "riskScore")).toMatchObject({ type: "score", required: false });
    const env = systemQuestions("risk", "FMEA", defaultFormSettings("risk", "FMEA", { domain: "ENVIRONMENT" }));
    expect(env.find((f) => f.key === "hazard")!.label).toBe("Environmental aspect and impact");
    expect(env.find((f) => f.key === "likelihood")!.options).toHaveLength(10);
  });
});

describe("F-02 configured components publish", () => {
  it("a heading and custom questions in any order publish cleanly", () => {
    const design = reportDesign([
      q("equipmentHeading", "Equipment", "heading"),
      q("equipmentCondition", "Equipment condition", "select", { required: true, options: conditionOptions }),
      q("damage", "Describe equipment damage", "textarea"),
    ]);
    expect(validateFormDesign(design, { forPublish: true })).toEqual([]);
  });
  it("new palette questions get unique keys and choice questions keep at least one option", () => {
    const a = newField("select", []);
    const b = newField("select", [a.key]);
    expect(a.key).not.toBe(b.key);
    expect(a.options).toHaveLength(2);
    const noOptions = reportDesign([q("x", "Choice", "select", { options: [] })]);
    expect(validateFormDesign(noOptions, { forPublish: false }).map((i) => i.message)).toContain('"Choice" needs at least one option');
  });
  it("unnamed custom questions cannot be published", () => {
    const design = reportDesign([newField("text", [])]);
    expect(validateFormDesign(design, { forPublish: false })).toEqual([]);
    expect(validateFormDesign(design, { forPublish: true })[0]!.message).toMatch(/Name question 5/);
  });
});

describe("F-03 reuse a custom field", () => {
  const source = q("equipmentCondition", "Equipment condition", "select", { required: true, options: conditionOptions, searchable: true });
  const forms = [
    { id: "f1", name: "Loading Bay Event", module: "incidents", fields: [...initialFields("incidents", "REPORT"), source] },
    { id: "f2", name: "Forklift Event", module: "incidents", fields: [{ ...source, key: "copy1" }] },
    { id: "f3", name: "Workshop checks", module: "risk", fields: [{ ...source, key: "copy2" }] },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `g${i}`, name: `Form ${i}`, module: "risk", fields: [q(`c${i}`, `Condition ${i}`)] })),
  ];

  it("shows identical definitions once and at most ten choices", () => {
    const choices = reusableQuestionChoices(forms, "condition");
    expect(choices).toHaveLength(10);
    expect(choices.filter((c) => c.field.label === "Equipment condition")).toHaveLength(1);
    expect(choices[0]).toMatchObject({ formName: "Loading Bay Event", module: "incidents" });
  });
  it("never offers system questions and skips the current form", () => {
    expect(reusableQuestionChoices(forms, "incident title")).toEqual([]);
    expect(reusableQuestionChoices(forms, "Equipment", { excludeFormId: "f1" })[0]!.formId).toBe("f2");
  });
  it("the copy is independent of its source", () => {
    const copy = copyQuestion(source, "newKey");
    copy.options![2]!.label = "Remove from use";
    expect(source.options![2]!.label).toBe("Unsafe");
    expect(copy).toMatchObject({ key: "newKey", label: "Equipment condition", required: true, searchable: true });
  });
});

describe("F-04 incident duplicates", () => {
  it("normalises case, spacing and punctuation", () => {
    expect(normaliseLabel("  What   happened?? ")).toBe("what happened");
    expect(normaliseLabel("H&S Impact")).toBe("h and s impact");
  });

  it.each([
    ["Severity", "text", "Severity"],
    ["Department", "text", "Department"],
    ["Assigned to", "person", "Assigned investigators"],
    ["Exact Location", "text", "Precise location"],
    ["Investigation Target Close Date", "date", "Investigation target date"],
    ["Description", "text", "Incident title"],
    ["Description", "textarea", "What happened?"],
    ["Description (free text field)", "textarea", "What happened?"],
    [" what happened? ", "textarea", "What happened?"],
  ] as const)("Report form rejects %s (%s) naming %s", (label, type, named) => {
    const design = reportDesign();
    const message = reuseConflict(design, { label, type });
    expect(message).toContain(named);
    const typed = reportDesign([q("dup", label, type)]);
    const issues = validateFormDesign(typed, { forPublish: true });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.fieldKey).toBe("dup");
  });

  it("allows distinct questions such as Describe equipment damage", () => {
    const design = reportDesign([q("damage", "Describe equipment damage", "textarea", { required: true }), q("rcaProof", "Attachment proving the root cause analysis", "file")]);
    expect(incidentConflicts(design.fields, "REPORT")).toEqual([]);
    expect(validateFormDesign(design, { forPublish: true })).toEqual([]);
  });

  it("rejects a second copy of a custom question", () => {
    const design = reportDesign([q("a", "Weather conditions"), q("b", "weather  conditions")]);
    expect(incidentConflicts(design.fields, "REPORT").map((c) => c.key)).toEqual(["b"]);
  });

  it.each(["Occupational Health Notified", "First Aid Outcome", "Investigation Target Close Date", "Exact Location"])("Report form rejects %s", (label) => {
    expect(incidentFieldConflict({ label, type: "text" }, "REPORT", reportDesign().fields)).not.toBeNull();
  });

  it.each(["Environmental Impact", "H&S Impact", "Reportable", "Basic Cause Types", "Cause Types", "Number of Days Lost"])("Investigation form rejects %s", (label) => {
    expect(incidentFieldConflict({ label, type: "text" }, "INVESTIGATION", investigationDesign().fields)).not.toBeNull();
  });

  it("keeps findings, root cause analysis and a 5 Why's question usable", () => {
    const design = investigationDesign([q("fiveWhys", "5 Why's", "textarea")]);
    expect(validateFormDesign(design, { forPublish: true })).toEqual([]);
  });

  it("older questionnaires: repeated defaults are identified so the workflow can use its own control", () => {
    expect(repeatedDefaultKeys([...initialFields("incidents", "REPORT"), q("sev", "Severity", "select", { options: conditionOptions })], "REPORT")).toEqual(["sev"]);
  });
});

describe("F-05 site-specific required questions", () => {
  const marine = q("marineArea", "Describe the marine area", "textarea", { required: true, siteIds: ["site-cork"], searchable: true, exportable: false });
  const fields = [...initialFields("incidents", "REPORT"), marine];
  const answers = { incidentTitle: "Spill", occurredAt: "2026-10-20T10:00", site: "Quay", whatHappened: "Oil on the quay" };

  it("a Cork report must answer it", () => {
    const cork = { fields: fieldsForSite(fields, "site-cork"), siteId: "site-cork" };
    const result = validateQuestionnaireAnswers(cork, answers, { mode: "submit" });
    expect(result.valid).toBe(false);
    expect(result.errors.marineArea).toBe("Describe the marine area is required");
  });
  it("a Dublin report neither presents nor requires it", () => {
    const dublin = { fields: fieldsForSite(fields, "site-dublin"), siteId: "site-dublin" };
    expect(dublin.fields.map((f) => f.key)).not.toContain("marineArea");
    expect(validateQuestionnaireAnswers(dublin, answers, { mode: "submit" }).valid).toBe(true);
  });
  it("drafts never require answers; headings and scores are never required", () => {
    const withHeading = { fields: [q("h", "Section", "heading"), { ...q("s", "Risk score", "score"), required: true }, ...fields], siteId: null };
    expect(validateQuestionnaireAnswers(withHeading, {}, { mode: "draft" }).valid).toBe(true);
    const submit = validateQuestionnaireAnswers(withHeading, answers, { mode: "submit" });
    expect(submit).toMatchObject({ valid: true });
  });
  it("person and file answers are validated", () => {
    const people = { fields: [q("who", "Witness", "person", { required: true }), q("photos", "Photos", "file", { required: true })], siteId: null };
    expect(validateQuestionnaireAnswers(people, {}, { mode: "submit" }).errors).toEqual({ who: "Witness is required", photos: "Photos is required" });
    const ok = validateQuestionnaireAnswers(people, { who: "user-1", photos: [{ uploadId: "u1", fileName: "a.jpg" }] }, { mode: "submit" });
    expect(ok.valid).toBe(true);
    expect(validateQuestionnaireAnswers(people, { who: "user-1", photos: [{ fileName: "a.jpg" }] }, { mode: "submit" }).valid).toBe(false);
  });
});

describe("Risk rules (form settings)", () => {
  const riskDesign = (settings: Record<string, unknown>): FormDesign => ({ module: "risk", purpose: "5x5", fields: initialFields("risk", "5x5", settings), settings });

  it("defaults are valid", () => {
    expect(validateFormDesign(riskDesign(defaultFormSettings("risk", "5x5")), { forPublish: true })).toEqual([]);
  });
  it("non-increasing thresholds are rejected", () => {
    const settings = { ...defaultFormSettings("risk", "5x5"), thresholds: { medium: 10, high: 8, critical: 20 } };
    const issues = validateFormDesign(riskDesign(settings), { forPublish: true });
    expect(issues.map((i) => i.path)).toContain("settings.thresholds");
  });
  it("review frequency and advance notice are bounded", () => {
    const issues = validateFormDesign(riskDesign({ ...defaultFormSettings("risk", "5x5"), reviewMonths: 18, advanceNoticeDays: 400 }), { forPublish: false });
    expect(issues.map((i) => i.path).sort()).toEqual(["settings.advanceNoticeDays", "settings.reviewMonths"]);
  });
});
