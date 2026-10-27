import { describe, expect, it } from "vitest";
import { applyTypeChoice, type TypeChoice, type TypeChoiceValues } from "./type-choice";

const accident: TypeChoice = {
  id: "t-acc",
  subtypes: [
    { id: "s-aed", name: "AED Used", isActive: true },
    { id: "s-fa", name: "First Aid", isActive: true },
  ],
  defaultConfidential: true,
  multipleInvestigators: true,
  targetDays: 7,
};
const complaint: TypeChoice = {
  id: "t-com",
  subtypes: [
    { id: "s-noise", name: "Noise nuisance", isActive: true },
    { id: "s-old", name: "General", isActive: false },
  ],
  defaultConfidential: false,
  multipleInvestigators: false,
  targetDays: 14,
};

type Values = TypeChoiceValues & { title: string; answers: Record<string, unknown> };
const base: Values = {
  typeId: "",
  subtypeId: null,
  isConfidential: false,
  investigatorIds: ["u1", "u2"],
  occurredAt: "2026-10-20T09:30",
  investigationTargetDate: "2026-10-27",
  targetTouched: false,
  title: "Barrier stuck",
  answers: { treatedAt: "First aid room" },
};

describe("applyTypeChoice", () => {
  it("sets the type's defaults: confidentiality, target date and its only active subtype", () => {
    const v = applyTypeChoice(base, complaint, { editing: false });
    expect(v).toMatchObject({ typeId: "t-com", subtypeId: "s-noise", isConfidential: false, investigationTargetDate: "2026-11-03", investigatorIds: ["u1"] });
  });

  it("asks for a subtype when the type has several", () => {
    expect(applyTypeChoice(base, accident, { editing: false }).subtypeId).toBeNull();
  });

  it("keeps everything not tied to the type, including answers the new form does not ask", () => {
    const first = applyTypeChoice(base, accident, { editing: false });
    const switched = applyTypeChoice({ ...first, subtypeId: "s-aed" }, complaint, { editing: false });
    expect(switched.title).toBe("Barrier stuck");
    expect(switched.answers).toEqual({ treatedAt: "First aid room" });
    expect(switched.occurredAt).toBe(base.occurredAt);
  });

  it("restores the subtype last chosen for a type when switching back", () => {
    const back = applyTypeChoice({ ...base, typeId: "t-com", subtypeId: "s-noise" }, accident, { editing: false, rememberedSubtypeId: "s-aed" });
    expect(back.subtypeId).toBe("s-aed");
    // A remembered subtype that was switched off is not restored.
    expect(applyTypeChoice(base, complaint, { editing: false, rememberedSubtypeId: "s-old" }).subtypeId).toBe("s-noise");
  });

  it("choosing the current type again changes nothing", () => {
    const chosen = { ...base, typeId: "t-acc", subtypeId: "s-fa", isConfidential: false };
    expect(applyTypeChoice(chosen, accident, { editing: false })).toBe(chosen);
  });

  it("keeps a date the reporter set and, when editing, the confidential flag", () => {
    const v = applyTypeChoice({ ...base, targetTouched: true, isConfidential: false }, accident, { editing: true });
    expect(v.investigationTargetDate).toBe("2026-10-27");
    expect(v.isConfidential).toBe(false);
  });
});
