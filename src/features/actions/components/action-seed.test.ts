import { describe, expect, it } from "vitest";
import { sanitiseSnapshot } from "@/lib/favourites/snapshot";
import type { FormFieldDefinition } from "@/lib/forms";
import type { ActionFormValues } from "./action-form";
import { mergeAction, pickAction } from "./action-seed";

const fresh: ActionFormValues = { title: "", description: "", ownerId: "u-me", dueDate: "2026-11-12", priority: "NORMAL", departmentId: "dep-mine", answers: {} };

const fields: FormFieldDefinition[] = [
  { key: "area", label: "Area", type: "text" },
  { key: "kind", label: "Kind", type: "radio", options: [{ value: "fix", label: "Fix" }, { value: "check", label: "Check" }] },
  { key: "doneBy", label: "Done by", type: "date" },
  { key: "evidence", label: "Evidence", type: "file" },
];
const form = { formId: "f-maint", versionId: "fv-2", fields, chosen: false };

const typed: ActionFormValues = {
  title: "Replace the ladder step",
  description: "Bottom step is cracked",
  ownerId: "u-sam",
  dueDate: "2026-10-30",
  priority: "HIGH",
  departmentId: null,
  answers: { area: "Loading bay", kind: "fix", doneBy: "2026-10-30", evidence: [{ uploadId: "up1", fileName: "step.jpg" }] },
};

describe("pickAction", () => {
  it("keeps the fields and text / choice answers – never the due date or file / date answers", () => {
    expect(pickAction(typed, fresh, form)).toEqual({
      title: "Replace the ladder step",
      description: "Bottom step is cracked",
      ownerId: "u-sam",
      priority: "HIGH",
      departmentId: null,
      formId: "f-maint",
      formVersionId: "fv-2",
      answers: { area: "Loading bay", kind: "fix" },
    });
  });

  it("keeps the form only when it was chosen or answered, and nothing for an untouched form", () => {
    expect(pickAction(fresh, fresh, form)).toEqual({});
    expect(pickAction(fresh, fresh, { ...form, chosen: true })).toEqual({ formId: "f-maint", formVersionId: "fv-2" });
    expect(sanitiseSnapshot(pickAction(fresh, fresh, null))).toBeNull();
  });
});

describe("mergeAction", () => {
  const seed = sanitiseSnapshot({ ...pickAction(typed, fresh, form), clientId: "c-1" })!;

  it("restores the fields with a fresh due date and the kept form", () => {
    const { values, form: kept } = mergeAction(fresh, seed, { departmentIds: ["dep-mine"] });
    expect(values).toEqual({ ...typed, dueDate: "2026-11-12", answers: { area: "Loading bay", kind: "fix" } });
    expect(kept).toEqual({ formId: "f-maint", versionId: "fv-2" });
    expect(seed).not.toHaveProperty("clientId");
  });

  it("keeps an explicit 'Whole company' but not a department that no longer exists", () => {
    expect(mergeAction(fresh, { departmentId: null }).values.departmentId).toBeNull();
    expect(mergeAction(fresh, { departmentId: "dep-gone" }, { departmentIds: ["dep-mine"] }).values.departmentId).toBe("dep-mine");
  });

  it("never brings back file answers, due dates or unknown fields", () => {
    const { values } = mergeAction(fresh, { formId: "f-maint", dueDate: "2020-01-01", answers: { evidence: [{ fileName: "x.jpg" }], area: "Yard" }, unknown: 1, priority: "SOMETIME" });
    expect(values).toEqual({ ...fresh, answers: { area: "Yard" } });
  });

  it("drops answers without a form", () => {
    expect(mergeAction(fresh, { answers: { area: "Yard" } })).toEqual({ values: fresh, form: null });
  });
});
