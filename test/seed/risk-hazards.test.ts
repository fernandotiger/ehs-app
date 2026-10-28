import { describe, expect, it } from "vitest";
import { normaliseLabel } from "@/lib/lookups";
import { DEMO_ASPECTS, DEMO_HAZARDS } from "../../prisma/seed/risk-hazards";

describe("demo hazard / aspect lists", () => {
  it("have no duplicates (the list is unique per form, ignoring case)", () => {
    for (const list of [DEMO_HAZARDS, DEMO_ASPECTS]) expect(new Set(list.map(normaliseLabel)).size).toBe(list.length);
  });

  it("include the names the demo assessments use, so they are list choices", () => {
    for (const name of ["Moving vehicles", "Poor visibility", "Fall from ladder", "Contact with moving parts", "Repetitive lifting", "Noise"]) expect(DEMO_HAZARDS).toContain(name);
    for (const name of ["Release to surface water", "Vapour emissions"]) expect(DEMO_ASPECTS).toContain(name);
  });
});
