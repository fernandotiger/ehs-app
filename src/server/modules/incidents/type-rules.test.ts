import { describe, expect, it } from "vitest";
import { INCIDENT_TYPE_KEYS } from "./catalogue";
import { cleanTypeName, typeKeyFor, typeNameClash, typeSettingsProblem } from "./type-rules";

describe("cleanTypeName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanTypeName("  Chemical   exposure ")).toBe("Chemical exposure");
  });
});

describe("typeKeyFor", () => {
  it("slugs the name", () => {
    expect(typeKeyFor("Chemical exposure", [])).toBe("chemical-exposure");
    expect(typeKeyFor("Fire / Smoke (minor)", [])).toBe("fire-smoke-minor");
    expect(typeKeyFor("Défaut équipement", [])).toBe("defaut-equipement");
  });

  it("adds a number when the key is taken", () => {
    expect(typeKeyFor("Fire", ["fire"])).toBe("fire-2");
    expect(typeKeyFor("Fire", ["fire", "fire-2"])).toBe("fire-3");
  });

  it("never takes a built-in, routing or retired key, even if that type is missing in the tenant", () => {
    expect(typeKeyFor("Near miss", [])).toBe("near-miss-2");
    expect(typeKeyFor("Audit non-conformance", [])).not.toBe(INCIDENT_TYPE_KEYS.AUDIT_NON_CONFORMANCE);
    expect(typeKeyFor("Environmental incident", [])).toBe("environmental-incident-2");
  });

  it("falls back when the name has no letters or digits, and caps the length", () => {
    expect(typeKeyFor("!!!", [])).toBe("type");
    const long = typeKeyFor("a".repeat(30) + " " + "b".repeat(30), []);
    expect(long.length).toBeLessThanOrEqual(48);
    expect(long.endsWith("-")).toBe(false);
  });
});

describe("typeNameClash", () => {
  const types = [
    { id: "1", name: "Near Miss", isActive: true },
    { id: "2", name: "Other", isActive: false },
  ];

  it("ignores case and spacing, and includes inactive types", () => {
    expect(typeNameClash("near  miss", types)?.id).toBe("1");
    expect(typeNameClash(" OTHER ", types)?.id).toBe("2");
    expect(typeNameClash("Chemical exposure", types)).toBeUndefined();
  });

  it("ignores the type being renamed", () => {
    expect(typeNameClash("Near miss", types, "1")).toBeUndefined();
    expect(typeNameClash("Other", types, "1")?.id).toBe("2");
  });
});

describe("typeSettingsProblem", () => {
  const ok = { isActive: true, reportFormId: "r", investigationRequired: true, investigationFormId: "i" };

  it("accepts a complete type", () => {
    expect(typeSettingsProblem(ok)).toBeNull();
    expect(typeSettingsProblem({ isActive: false, reportFormId: null, investigationRequired: false, investigationFormId: null })).toBeNull();
  });

  it("needs an investigation form before an investigation can be required", () => {
    expect(typeSettingsProblem({ ...ok, investigationFormId: null })?.blockers).toEqual(["Choose a published Investigation form, or make the investigation optional."]);
  });

  it("needs a report form for an active type", () => {
    expect(typeSettingsProblem({ ...ok, reportFormId: null })?.message).toBe("An active type needs a published Report form.");
  });
});
