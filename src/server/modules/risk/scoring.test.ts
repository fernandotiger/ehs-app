import { describe, expect, it } from "vitest";
import { defaultRiskSettings } from "@/lib/forms/settings";
import { FMEA_FACTORS, type RiskDomain } from "@/lib/risk/scoring";
import { applyFactor, classify, factorValue, matrixCell, methodValueIssues, scoreAssessment, scoreHazard, scoringFactors } from "./scoring";

function ratings(domain: RiskDomain, byGroup: { severity: number; likelihood: number; detection: number }) {
  return Object.fromEntries(FMEA_FACTORS[domain].map((f) => [f.key, byGroup[f.group]]));
}

describe("R-01 multi-hazard 5×5 assessment", () => {
  const rules = defaultRiskSettings("5x5");
  const hazards = [
    { likelihood: 4, severity: 5 },
    { likelihood: 2, severity: 3 },
  ];
  it("scores each hazard and takes the HIGHEST as overall (not 26 or 13)", () => {
    const result = scoreAssessment("5x5", "HEALTH_SAFETY", hazards);
    expect(result.scores).toEqual([20, 6]);
    expect(result.score).toBe(20);
    expect(classify(result.score, rules)).toBe("CRITICAL");
  });
  it("ignores incomplete hazards and reports what is missing", () => {
    expect(scoreHazard("5x5", "HEALTH_SAFETY", { likelihood: 4 })).toBeNull();
    expect(methodValueIssues("5x5", "HEALTH_SAFETY", { likelihood: 6, severity: 2 })).toEqual(["likelihood (1–5)"]);
    expect(scoreAssessment("5x5", "HEALTH_SAFETY", [{ likelihood: 4 }, { likelihood: 1, severity: 2 }]).score).toBe(2);
    expect(scoreAssessment("5x5", "HEALTH_SAFETY", []).score).toBeNull();
  });
});

describe("R-03 boundaries are inclusive and captured", () => {
  const captured = defaultRiskSettings("5x5");
  it("5/10/20 begin Medium/High/Critical at the default boundaries", () => {
    expect(classify(4, captured)).toBe("LOW");
    expect(classify(5, captured)).toBe("MEDIUM");
    expect(classify(10, captured)).toBe("HIGH");
    expect(classify(20, captured)).toBe("CRITICAL");
  });
  it("a later rule change (6/12/21) only affects assessments that capture it", () => {
    const later = { ...captured, thresholds: { medium: 6, high: 12, critical: 21 } };
    expect(classify(20, captured)).toBe("CRITICAL");
    expect(classify(20, later)).toBe("HIGH");
  });
  it("3×3 uses 1–3 values", () => {
    expect(scoreHazard("3x3", "ENVIRONMENT", { likelihood: 3, severity: 3 })).toBe(9);
    expect(scoreHazard("3x3", "ENVIRONMENT", { likelihood: 4, severity: 1 })).toBeNull();
    expect(classify(9, defaultRiskSettings("3x3"))).toBe("CRITICAL");
  });
});

describe("R-04 FMEA", () => {
  const rules = defaultRiskSettings("FMEA", "ENVIRONMENT");
  it("rounds 6 × 4 × 3 = 72, second hazard 30, overall 72 (Medium)", () => {
    const a = { factors: ratings("ENVIRONMENT", { severity: 6, likelihood: 4, detection: 3 }) };
    const b = { factors: ratings("ENVIRONMENT", { severity: 5, likelihood: 3, detection: 2 }) };
    const result = scoreAssessment("FMEA", "ENVIRONMENT", [a, b]);
    expect(result.scores).toEqual([72, 30]);
    expect(result.score).toBe(72);
    expect(classify(72, rules)).toBe("MEDIUM");
  });
  it("needs every factor rated", () => {
    const partial = ratings("HEALTH_SAFETY", { severity: 5, likelihood: 5, detection: 5 });
    delete partial.monitoring;
    expect(scoreHazard("FMEA", "HEALTH_SAFETY", { factors: partial })).toBeNull();
    expect(methodValueIssues("FMEA", "HEALTH_SAFETY", { factors: partial })).toEqual(["ratings for 1 FMEA factor"]);
  });
});

describe("R-05 checklist", () => {
  const rules = defaultRiskSettings("CHECKLIST");
  it("Yes / N/A / No contribute 0 / 0 / 1 → Action required; replacing No with Yes → Satisfactory", () => {
    const first = scoreAssessment("CHECKLIST", "HEALTH_SAFETY", [{ checklistResult: "YES" }, { checklistResult: "NOT_APPLICABLE" }, { checklistResult: "NO" }]);
    expect(first.scores).toEqual([0, 0, 1]);
    expect(classify(first.score, rules)).toBe("ACTION_REQUIRED");
    const second = scoreAssessment("CHECKLIST", "HEALTH_SAFETY", [{ checklistResult: "YES" }, { checklistResult: "NOT_APPLICABLE" }, { checklistResult: "YES" }]);
    expect(second.score).toBe(0);
    expect(classify(second.score, rules)).toBe("SATISFACTORY");
  });
});

describe("scoring factors for RA tasks (R-06)", () => {
  it("matrix tasks change likelihood or severity", () => {
    expect(scoringFactors("5x5", "HEALTH_SAFETY").map((f) => f.key)).toEqual(["likelihood", "severity"]);
    const h = { likelihood: 4, severity: 5 };
    expect(factorValue("5x5", h, "likelihood")).toBe(4);
    const after = applyFactor("5x5", "HEALTH_SAFETY", h, "likelihood", 2);
    expect(scoreHazard("5x5", "HEALTH_SAFETY", after)).toBe(10);
    expect(() => applyFactor("5x5", "HEALTH_SAFETY", h, "likelihood", 6)).toThrow(RangeError);
    expect(() => applyFactor("5x5", "HEALTH_SAFETY", h, "monitoring", 2)).toThrow(RangeError);
  });
  it("FMEA tasks change one factor; checklist tasks set Yes (0) or No (1)", () => {
    const h = { factors: ratings("HEALTH_SAFETY", { severity: 6, likelihood: 4, detection: 3 }) };
    const after = applyFactor("FMEA", "HEALTH_SAFETY", h, "monitoring", 1);
    expect(after.factors!.monitoring).toBe(1);
    expect(scoreHazard("FMEA", "HEALTH_SAFETY", after)).toBe(Math.round(6 * 4 * 2.6));
    expect(applyFactor("CHECKLIST", "HEALTH_SAFETY", { checklistResult: "NO" }, "checklist", 0).checklistResult).toBe("YES");
    expect(factorValue("CHECKLIST", { checklistResult: "NO" }, "checklist")).toBe(1);
  });
  it("heat-map cells only exist for matrix methods", () => {
    expect(matrixCell("5x5", { likelihood: 4, severity: 5 })).toEqual({ likelihood: 4, severity: 5 });
    expect(matrixCell("FMEA", { likelihood: 4, severity: 5 })).toBeNull();
  });
});
