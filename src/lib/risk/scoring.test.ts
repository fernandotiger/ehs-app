import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  FMEA_FACTORS,
  checklistScore,
  defaultThresholds,
  fmeaScore,
  hazardScore,
  matrixScore,
  overallScore,
  riskBand,
  validateThresholds,
  type RiskDomain,
} from "./scoring";

function ratings(domain: RiskDomain, byGroup: { severity: number; likelihood: number; detection: number }) {
  return Object.fromEntries(FMEA_FACTORS[domain].map((f) => [f.key, byGroup[f.group]]));
}

describe("matrix scoring", () => {
  it("multiplies likelihood by severity within the method range", () => {
    expect(matrixScore("5x5", 4, 5)).toBe(20);
    expect(matrixScore("3x3", 3, 2)).toBe(6);
    expect(() => matrixScore("3x3", 4, 1)).toThrow(RangeError);
    expect(() => matrixScore("5x5", 0, 1)).toThrow(RangeError);
  });
});

describe("FMEA", () => {
  it("rounds the product of the three group averages", () => {
    expect(fmeaScore("HEALTH_SAFETY", ratings("HEALTH_SAFETY", { severity: 5, likelihood: 4, detection: 3 }))).toBe(60);
    // Mixed ratings: severity avg (2+3+4+5+6)/5 = 4, likelihood 2, detection (3+3+2+2+3)/5 = 2.6 → round(20.8) = 21
    const r = ratings("HEALTH_SAFETY", { severity: 1, likelihood: 2, detection: 2 });
    Object.assign(r, { peopleExposed: 2, sensitivity: 3, exposureDuration: 4, harm: 5, regulatoryLimits: 6, monitoring: 3, incidentHistory: 3, managementAudit: 3 });
    expect(fmeaScore("HEALTH_SAFETY", r)).toBe(21);
  });
  it("uses the domain's factor groups (Environment has six severity factors)", () => {
    expect(FMEA_FACTORS.ENVIRONMENT.filter((f) => f.group === "severity")).toHaveLength(6);
    expect(FMEA_FACTORS.HEALTH_SAFETY.filter((f) => f.group === "severity")).toHaveLength(5);
    expect(fmeaScore("ENVIRONMENT", ratings("ENVIRONMENT", { severity: 10, likelihood: 10, detection: 10 }))).toBe(1000);
  });
  it("requires every factor to be rated 1–10", () => {
    expect(() => fmeaScore("ENVIRONMENT", {})).toThrow(RangeError);
    expect(() => fmeaScore("HEALTH_SAFETY", ratings("HEALTH_SAFETY", { severity: 11, likelihood: 1, detection: 1 }))).toThrow(RangeError);
  });
});

describe("checklist and overall score", () => {
  it("a No contributes 1, Yes / Not applicable 0", () => {
    expect(checklistScore("NO")).toBe(1);
    expect(checklistScore("YES")).toBe(0);
    expect(checklistScore("NOT_APPLICABLE")).toBe(0);
  });
  it("the overall score is the highest hazard score, never a sum", () => {
    const scores = [hazardScore({ method: "5x5", likelihood: 2, severity: 3 }), hazardScore({ method: "5x5", likelihood: 4, severity: 4 })];
    expect(overallScore(scores)).toBe(16);
    expect(overallScore([])).toBe(0);
  });
});

describe("banding (inclusive boundaries)", () => {
  it("5×5 defaults 5 / 10 / 20", () => {
    expect([4, 5, 9, 10, 19, 20, 25].map((s) => riskBand(s, "5x5"))).toEqual(["LOW", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "CRITICAL", "CRITICAL"]);
  });
  it("3×3 defaults 3 / 6 / 9 and FMEA 50 / 250 / 500", () => {
    expect([2, 3, 6, 9].map((s) => riskBand(s, "3x3"))).toEqual(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
    expect([49, 50, 250, 500].map((s) => riskBand(s, "FMEA"))).toEqual(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
    expect(DEFAULT_THRESHOLDS.FMEA).toEqual({ medium: 50, high: 250, critical: 500 });
  });
  it("custom thresholds and checklist results", () => {
    expect(riskBand(12, "5x5", { medium: 4, high: 12, critical: 16 })).toBe("HIGH");
    expect(riskBand(0, "CHECKLIST")).toBe("SATISFACTORY");
    expect(riskBand(1, "CHECKLIST")).toBe("ACTION_REQUIRED");
  });
});

describe("threshold validation", () => {
  it("boundaries must increase and stay within the method maximum", () => {
    expect(validateThresholds("5x5", { medium: 5, high: 10, critical: 20 })).toBeNull();
    expect(validateThresholds("5x5", { medium: 10, high: 10, critical: 20 })).toMatch(/increase/);
    expect(validateThresholds("5x5", { medium: 12, high: 8, critical: 20 })).toMatch(/increase/);
    expect(validateThresholds("3x3", { medium: 3, high: 6, critical: 10 })).toMatch(/maximum score of 9/);
    expect(validateThresholds("FMEA", { medium: 50, high: 250, critical: 1000 })).toBeNull();
    expect(validateThresholds("FMEA", { medium: 0, high: 250, critical: 500 })).toMatch(/at least 1/);
  });
  it("checklist has no numeric thresholds", () => {
    expect(defaultThresholds("CHECKLIST")).toBeNull();
    expect(validateThresholds("CHECKLIST", null)).toBeNull();
    expect(validateThresholds("CHECKLIST", { medium: 1, high: 2, critical: 3 })).not.toBeNull();
  });
});
