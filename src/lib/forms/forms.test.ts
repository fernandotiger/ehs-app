import { describe, expect, it } from "vitest";
import {
  buildZodSchema,
  evaluateCondition,
  formatAnswer,
  formSchemaDefinitionSchema,
  isFieldVisible,
  keyFromLabel,
  parseStoredFormSchema,
  pruneFormValues,
  validateFormData,
  visibleFields,
  type FormFieldDefinition,
} from "./index";

const fields: FormFieldDefinition[] = [
  { key: "activity", label: "Activity at time", type: "text", required: true, max: 20 },
  { key: "ppeWorn", label: "PPE worn", type: "boolean", required: true },
  {
    key: "ppeTypes",
    label: "PPE types",
    type: "multiselect",
    required: true,
    options: [
      { value: "gloves", label: "Gloves" },
      { value: "boots", label: "Safety boots" },
    ],
    showWhen: { field: "ppeWorn", operator: "equals", value: true },
  },
  {
    key: "glovesType",
    label: "Glove type",
    type: "select",
    required: true,
    options: [{ value: "nitrile", label: "Nitrile" }],
    showWhen: { field: "ppeTypes", operator: "in", value: ["gloves"] },
  },
  { key: "cost", label: "Estimated cost", type: "number", min: 0, max: 1000 },
  { key: "confirmed", label: "Supervisor informed", type: "checkbox", required: true },
  { key: "when", label: "When", type: "date" },
  { key: "at", label: "At", type: "datetime" },
  { key: "clock", label: "Clock", type: "time" },
  { key: "severity", label: "Severity", type: "radio", options: [{ value: "low", label: "Low" }] },
];

describe("evaluateCondition", () => {
  const values = { a: "x", b: ["1", "2"], c: "", n: 5, t: true };
  it("equals / notEquals with loose matching", () => {
    expect(evaluateCondition({ field: "a", operator: "equals", value: "x" }, values)).toBe(true);
    expect(evaluateCondition({ field: "n", operator: "equals", value: "5" }, values)).toBe(true);
    expect(evaluateCondition({ field: "t", operator: "equals", value: "true" }, values)).toBe(true);
    expect(evaluateCondition({ field: "a", operator: "notEquals", value: "y" }, values)).toBe(true);
    expect(evaluateCondition({ field: "a", operator: "notEquals", value: "x" }, values)).toBe(false);
    expect(evaluateCondition({ field: "c", operator: "notEquals", value: "x" }, values)).toBe(false);
  });
  it("in matches any selected value of a multiselect", () => {
    expect(evaluateCondition({ field: "b", operator: "in", value: ["2", "9"] }, values)).toBe(true);
    expect(evaluateCondition({ field: "b", operator: "in", value: ["9"] }, values)).toBe(false);
    expect(evaluateCondition({ field: "b", operator: "equals", value: "1" }, values)).toBe(true);
  });
  it("empty / notEmpty", () => {
    expect(evaluateCondition({ field: "c", operator: "empty" }, values)).toBe(true);
    expect(evaluateCondition({ field: "missing", operator: "empty" }, values)).toBe(true);
    expect(evaluateCondition({ field: "b", operator: "notEmpty" }, values)).toBe(true);
    expect(evaluateCondition({ field: "c", operator: "notEmpty" }, values)).toBe(false);
  });
});

describe("visibility", () => {
  it("shows unconditional fields", () => {
    expect(isFieldVisible(fields[0]!, fields, {})).toBe(true);
  });
  it("hides conditional fields until the condition matches", () => {
    expect(visibleFields(fields, {}).map((f) => f.key)).not.toContain("ppeTypes");
    expect(visibleFields(fields, { ppeWorn: true }).map((f) => f.key)).toContain("ppeTypes");
  });
  it("is transitive – a child of a hidden parent is hidden even with a stale answer", () => {
    const stale = { ppeWorn: false, ppeTypes: ["gloves"] };
    expect(visibleFields(fields, stale).map((f) => f.key)).not.toContain("glovesType");
    expect(visibleFields(fields, { ppeWorn: true, ppeTypes: ["gloves"] }).map((f) => f.key)).toContain("glovesType");
  });
  it("treats cycles as hidden", () => {
    const cyclic: FormFieldDefinition[] = [
      { key: "a", label: "A", type: "text", showWhen: { field: "b", operator: "notEmpty" } },
      { key: "b", label: "B", type: "text", showWhen: { field: "a", operator: "notEmpty" } },
    ];
    expect(visibleFields(cyclic, { a: "1", b: "1" })).toEqual([]);
  });
  it("pruneFormValues drops hidden, unknown and empty answers", () => {
    expect(pruneFormValues(fields, { activity: "Lifting", ppeWorn: false, ppeTypes: ["gloves"], unknown: 1, cost: "" })).toEqual({
      activity: "Lifting",
      ppeWorn: false,
    });
  });
});

describe("buildZodSchema / validateFormData", () => {
  const valid = { activity: "Lifting", ppeWorn: false, confirmed: true };

  it("accepts a complete submission and strips hidden answers", () => {
    const result = validateFormData(fields, { ...valid, ppeTypes: ["gloves"], extra: "x" });
    expect(result).toEqual({ success: true, data: valid });
  });

  it("only includes visible fields in the schema", () => {
    expect(Object.keys(buildZodSchema(fields, {}).shape)).not.toContain("ppeTypes");
    expect(Object.keys(buildZodSchema(fields, { ppeWorn: true }).shape)).toContain("ppeTypes");
  });

  it("reports missing required fields with readable messages", () => {
    const result = validateFormData(fields, {});
    expect(result.success).toBe(false);
    if (result.success) return;
    const byPath = Object.fromEntries(result.issues.map((i) => [i.path, i.message]));
    expect(byPath.activity).toBe("Activity at time is required");
    expect(byPath.ppeWorn).toBe("PPE worn is required");
    expect(byPath.confirmed).toBe("Supervisor informed is required");
    expect(byPath.ppeTypes).toBeUndefined();
  });

  it("requires conditional fields once visible", () => {
    const result = validateFormData(fields, { ...valid, ppeWorn: true });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.map((i) => i.path)).toEqual(["ppeTypes"]);
  });

  it("treats an empty multiselect as unanswered", () => {
    const result = validateFormData(fields, { ...valid, ppeWorn: true, ppeTypes: [] });
    expect(result.success).toBe(false);
  });

  it("requires a required checkbox to be ticked", () => {
    const result = validateFormData(fields, { ...valid, confirmed: false });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues[0]!.message).toBe("Supervisor informed must be ticked");
  });

  it("coerces numeric and boolean strings from HTML inputs", () => {
    const result = validateFormData(fields, { ...valid, ppeWorn: "false", cost: "12.5" });
    expect(result).toEqual({ success: true, data: { ...valid, cost: 12.5 } });
  });

  it("enforces min/max, option membership and formats", () => {
    const result = validateFormData(fields, {
      ...valid,
      activity: "x".repeat(21),
      cost: 5000,
      severity: "extreme",
      when: "14/09/2026",
      at: "2026-09-14 10:00",
      clock: "9am",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((i) => i.path).sort()).toEqual(["activity", "at", "clock", "cost", "severity", "when"]);
  });

  it("accepts valid date, datetime and time formats", () => {
    const result = validateFormData(fields, { ...valid, when: "2026-09-14", at: "2026-09-14T10:30", clock: "10:30" });
    expect(result.success).toBe(true);
  });

  it("draft mode allows missing required answers but still checks types", () => {
    expect(validateFormData(fields, {}, "draft")).toEqual({ success: true, data: {} });
    expect(validateFormData(fields, { confirmed: false }, "draft").success).toBe(true);
    expect(validateFormData(fields, { cost: "abc" }, "draft").success).toBe(false);
  });

  it("handles null / undefined values", () => {
    expect(validateFormData([], null)).toEqual({ success: true, data: {} });
  });
});

describe("formSchemaDefinitionSchema", () => {
  it("accepts the sample definition", () => {
    expect(formSchemaDefinitionSchema.safeParse(fields).success).toBe(true);
  });
  it("rejects duplicate keys, missing options and forward references", () => {
    const result = formSchemaDefinitionSchema.safeParse([
      { key: "a", label: "A", type: "select" },
      { key: "a", label: "A2", type: "text" },
      { key: "c", label: "C", type: "text", showWhen: { field: "d", operator: "notEmpty" } },
      { key: "d", label: "D", type: "text" },
      { key: "e", label: "E", type: "number", min: 5, max: 1 },
      { key: "f", label: "F", type: "text", showWhen: { field: "d", operator: "equals" } },
    ]);
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain('Duplicate field key "a"');
    expect(messages).toContain('"A" needs at least one option');
    expect(messages).toContain('"C" can only depend on a field above it');
    expect(messages).toContain('"E": minimum is greater than maximum');
    expect(messages).toContain('"F": choose the value that shows it');
  });
  it("rejects invalid keys", () => {
    expect(formSchemaDefinitionSchema.safeParse([{ key: "1bad key", label: "x", type: "text" }]).success).toBe(false);
  });
  it("parseStoredFormSchema drops malformed entries", () => {
    expect(parseStoredFormSchema([{ key: "ok", label: "Ok", type: "text" }, { nope: true }])).toHaveLength(1);
    expect(parseStoredFormSchema("not an array")).toEqual([]);
  });
});

describe("helpers", () => {
  it("keyFromLabel produces unique camelCase keys", () => {
    expect(keyFromLabel("PPE worn?")).toBe("ppeWorn");
    expect(keyFromLabel("PPE worn?", ["ppeWorn"])).toBe("ppeWorn2");
    expect(keyFromLabel("123")).toBe("field123");
  });
  it("formatAnswer renders labels", () => {
    expect(formatAnswer(fields[1]!, true)).toBe("Yes");
    expect(formatAnswer(fields[2]!, ["gloves", "boots"])).toBe("Gloves, Safety boots");
    expect(formatAnswer(fields[7]!, "2026-09-14T10:30")).toBe("2026-09-14 10:30");
    expect(formatAnswer(fields[0]!, "")).toBe("");
  });
});
