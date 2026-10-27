import { describe, expect, it } from "vitest";
import { counterKey, defaultNumberFormat, formatReference, NUMBERING_KEYS } from "./numbering";
import { resolveSetting } from "./registry";
import { DEFAULT_SYSTEM_SETTINGS } from "./system";

describe("reference number formatting", () => {
  it("formats with year and padding", () => {
    expect(formatReference({ prefix: "INC", includeYear: true, padding: 4 }, 2026, 1)).toBe("INC-2026-0001");
    expect(formatReference({ prefix: "INC", includeYear: true, padding: 4 }, 2026, 12345)).toBe("INC-2026-12345");
  });

  it("formats without year", () => {
    expect(formatReference({ prefix: "ACT", includeYear: false, padding: 3 }, 2026, 7)).toBe("ACT-007");
  });

  it("restarts the counter per year only when the year is part of the reference", () => {
    expect(counterKey("incident", { prefix: "INC", includeYear: true, padding: 4 }, 2026)).toBe("incident:2026");
    expect(counterKey("incident", { prefix: "INC", includeYear: false, padding: 4 }, 2026)).toBe("incident");
  });

  it("has a default format for every catalogued record type and unknown keys", () => {
    for (const key of NUMBERING_KEYS) expect(defaultNumberFormat(key).prefix).toMatch(/^[A-Z]+$/);
    expect(defaultNumberFormat("incident")).toEqual({ prefix: "INC", includeYear: true, padding: 4 });
    expect(defaultNumberFormat("permit-to-work").prefix).toBe("PERMIT");
  });
});

describe("settings registry", () => {
  it("returns defaults when nothing is stored", () => {
    expect(resolveSetting("system", null)).toEqual(DEFAULT_SYSTEM_SETTINGS);
    expect(resolveSetting("system", null).evidenceMaxUploadMb).toBe(2);
  });

  it("merges stored fields over defaults", () => {
    expect(resolveSetting("system", { maxUploadSizeMb: 25 })).toEqual({ ...DEFAULT_SYSTEM_SETTINGS, maxUploadSizeMb: 25 });
  });

  it("falls back to defaults when the stored value is invalid", () => {
    expect(resolveSetting("system", { maxUploadSizeMb: -1 })).toEqual(DEFAULT_SYSTEM_SETTINGS);
    expect(resolveSetting("system", "garbage")).toEqual(DEFAULT_SYSTEM_SETTINGS);
  });

  it("merges numbering formats per record type", () => {
    const value = resolveSetting("numbering", { incident: { prefix: "IR" }, "permit-to-work": { prefix: "PTW", includeYear: false, padding: 5 } });
    expect(value.incident).toEqual({ prefix: "IR", includeYear: true, padding: 4 });
    expect(value["permit-to-work"]).toEqual({ prefix: "PTW", includeYear: false, padding: 5 });
    expect(value.audit).toEqual(defaultNumberFormat("audit"));
  });
});
