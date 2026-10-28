import { describe, expect, it } from "vitest";
import { checkHazardNames, hazardOptionUpdateSchema, riskHazardListKey, usesHazardList } from "./hazard-options";

const OPTIONS = [
  { label: "Moving vehicles", isActive: true },
  { label: "Working at height", isActive: true },
  { label: "Asbestos", isActive: false },
];

describe("hazard options of a risk type", () => {
  it("has one list per Risk form", () => {
    expect(riskHazardListKey("form1")).toBe("risk.hazard:form1");
    expect(riskHazardListKey("form1")).not.toBe(riskHazardListKey("form2"));
  });

  it("offers a dropdown only while an option is switched on", () => {
    expect(usesHazardList(OPTIONS)).toBe(true);
    expect(usesHazardList([{ label: "Asbestos", isActive: false }])).toBe(false);
    expect(usesHazardList([])).toBe(false);
  });

  it("keeps free text when the form has no list in use", () => {
    expect(checkHazardNames([{ id: null, name: " Anything " }], new Map(), [])).toEqual({ names: ["Anything"], problems: [] });
  });

  it("stores new names with the option's spelling", () => {
    expect(checkHazardNames([{ id: null, name: "moving  VEHICLES" }], new Map(), OPTIONS)).toEqual({ names: ["Moving vehicles"], problems: [] });
  });

  it("refuses new names that are not in the list or switched off", () => {
    const result = checkHazardNames(
      [
        { id: null, name: "Noise" },
        { id: null, name: "asbestos" },
      ],
      new Map(),
      OPTIONS,
      "hazard",
    );
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0]).toContain("“Noise” is not in it");
    expect(result.problems[1]).toContain("“Asbestos” has been switched off");
  });

  it("keeps the name an existing hazard already has (renamed, switched off or removed option)", () => {
    const saved = new Map([
      ["h1", "Fall from ladder"],
      ["h2", "Asbestos"],
    ]);
    const result = checkHazardNames(
      [
        { id: "h1", name: "fall from ladder" },
        { id: "h2", name: "Asbestos" },
      ],
      saved,
      OPTIONS,
    );
    expect(result).toEqual({ names: ["Fall from ladder", "Asbestos"], problems: [] });
  });

  it("checks a changed name of an existing hazard like a new one", () => {
    const result = checkHazardNames([{ id: "h1", name: "Noise" }], new Map([["h1", "Fall from ladder"]]), OPTIONS);
    expect(result.problems).toHaveLength(1);
  });

  it("leaves empty names to the workflow gates", () => {
    expect(checkHazardNames([{ id: null, name: "  " }], new Map(), OPTIONS)).toEqual({ names: [""], problems: [] });
  });

  it("needs something to change", () => {
    expect(hazardOptionUpdateSchema.safeParse({}).success).toBe(false);
    expect(hazardOptionUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(hazardOptionUpdateSchema.safeParse({ label: " " }).success).toBe(false);
  });
});
