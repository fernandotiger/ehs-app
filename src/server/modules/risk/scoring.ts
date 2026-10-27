/**
 * Risk assessment scoring on top of the shared maths in src/lib/risk/scoring.ts (pure, tested –
 * see scoring.test.ts, examples R-01/R-03/R-04/R-05). Safe for client components (wizard live
 * score chips) and the server.
 *
 *  - per hazard/aspect: 5×5 / 3×3 likelihood × severity, FMEA rounded product of the three group
 *    averages, Checklist No = 1 / Yes or N/A = 0;
 *  - overall: the HIGHEST hazard score – never a sum or an average;
 *  - band: inclusive boundaries of the CAPTURED rules (Checklist: Satisfactory / Action required).
 */
import type { RiskFormSettings } from "@/lib/forms/settings";
import type { ChecklistResultKey } from "@/lib/risk/labels";
import {
  FMEA_FACTORS,
  hazardScore,
  METHOD_RATING_MAX,
  overallScore,
  riskBand,
  type FmeaGroup,
  type RiskBand,
  type RiskDomain,
  type RiskMethod,
} from "@/lib/risk/scoring";

export interface HazardValues {
  likelihood?: number | null;
  severity?: number | null;
  /** FMEA ratings { factorKey: 1–10 }. */
  factors?: Record<string, number> | null;
  checklistResult?: ChecklistResultKey | string | null;
}

export type ScoringRules = Pick<RiskFormSettings, "method" | "domain" | "thresholds">;

function domainOf(domain: string): RiskDomain {
  return domain === "ENVIRONMENT" ? "ENVIRONMENT" : "HEALTH_SAFETY";
}

const inRange = (v: unknown, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max;

/** Readable problems with the method values of one hazard (empty = complete and valid). */
export function methodValueIssues(method: RiskMethod, domain: string, h: HazardValues): string[] {
  switch (method) {
    case "5x5":
    case "3x3": {
      const max = METHOD_RATING_MAX[method];
      const issues: string[] = [];
      if (!inRange(h.likelihood, max)) issues.push(`likelihood (1–${max})`);
      if (!inRange(h.severity, max)) issues.push(`severity (1–${max})`);
      return issues;
    }
    case "FMEA": {
      const ratings = h.factors ?? {};
      const missing = FMEA_FACTORS[domainOf(domain)].filter((f) => !inRange(ratings[f.key], 10));
      return missing.length ? [`ratings for ${missing.length} FMEA factor${missing.length === 1 ? "" : "s"}`] : [];
    }
    case "CHECKLIST":
      return h.checklistResult === "YES" || h.checklistResult === "NO" || h.checklistResult === "NOT_APPLICABLE" ? [] : ["a checklist result (Yes, No or N/A)"];
  }
}

/** Score of one hazard/aspect, or null while its method values are incomplete. */
export function scoreHazard(method: RiskMethod, domain: string, h: HazardValues): number | null {
  if (methodValueIssues(method, domain, h).length) return null;
  switch (method) {
    case "5x5":
    case "3x3":
      return hazardScore({ method, likelihood: h.likelihood!, severity: h.severity! });
    case "FMEA":
      return hazardScore({ method, domain: domainOf(domain), ratings: h.factors! });
    case "CHECKLIST":
      return hazardScore({ method, result: h.checklistResult as ChecklistResultKey });
  }
}

/** Per-hazard scores and the overall score (highest scored hazard; null when none is scored). */
export function scoreAssessment(method: RiskMethod, domain: string, hazards: readonly HazardValues[]): { scores: (number | null)[]; score: number | null } {
  const scores = hazards.map((h) => scoreHazard(method, domain, h));
  const scored = scores.filter((s): s is number => s !== null);
  return { scores, score: scored.length ? overallScore(scored) : null };
}

/** Band of a score under the captured rules (null for no score). */
export function classify(score: number | null | undefined, rules: ScoringRules): RiskBand | null {
  if (score === null || score === undefined) return null;
  return riskBand(score, rules.method, rules.thresholds);
}

/** "High" bands that need attention on Overview/Home (High, Critical, Action required). */
export const ATTENTION_BANDS: RiskBand[] = ["HIGH", "CRITICAL", "ACTION_REQUIRED"];

// ── Scoring factors (RA tasks) ──────────────────────────────────────────────

export interface ScoringFactor {
  key: string;
  label: string;
  min: number;
  max: number;
  group?: FmeaGroup;
}

/** Factors a top-level RA task can change on completion. Checklist: 0 = Yes, 1 = No. */
export function scoringFactors(method: RiskMethod, domain: string): ScoringFactor[] {
  switch (method) {
    case "5x5":
    case "3x3":
      return [
        { key: "likelihood", label: "Likelihood", min: 1, max: METHOD_RATING_MAX[method] },
        { key: "severity", label: "Severity", min: 1, max: METHOD_RATING_MAX[method] },
      ];
    case "FMEA":
      return FMEA_FACTORS[domainOf(domain)].map((f) => ({ key: f.key, label: f.label, min: 1, max: 10, group: f.group }));
    case "CHECKLIST":
      return [{ key: "checklist", label: "Checklist result (0 = Yes, 1 = No)", min: 0, max: 1 }];
  }
}

export function findFactor(method: RiskMethod, domain: string, key: string | null | undefined): ScoringFactor | null {
  if (!key) return null;
  return scoringFactors(method, domain).find((f) => f.key === key) ?? null;
}

/** Current value of a factor on a hazard (null when not set). */
export function factorValue(method: RiskMethod, h: HazardValues, factor: string): number | null {
  if (method === "CHECKLIST") return h.checklistResult === "NO" ? 1 : h.checklistResult ? 0 : null;
  if (factor === "likelihood" || factor === "severity") return (method === "FMEA" ? null : h[factor]) ?? null;
  return h.factors?.[factor] ?? null;
}

/** The hazard values after a completed scoring task sets `factor` to `value` (validated range). */
export function applyFactor(method: RiskMethod, domain: string, h: HazardValues, factor: string, value: number): HazardValues {
  const f = findFactor(method, domain, factor);
  if (!f) throw new RangeError("Choose a scoring factor of this assessment's method.");
  if (!Number.isInteger(value) || value < f.min || value > f.max) throw new RangeError(`${f.label} must be a whole number from ${f.min} to ${f.max}.`);
  if (method === "CHECKLIST") return { ...h, checklistResult: value === 1 ? "NO" : "YES" };
  if (method === "FMEA") return { ...h, factors: { ...(h.factors ?? {}), [factor]: value } };
  return { ...h, [factor]: value };
}

/** Heat-map cell of a matrix hazard (null for FMEA/Checklist or incomplete values). */
export function matrixCell(method: RiskMethod, h: HazardValues): { likelihood: number; severity: number } | null {
  if (method !== "5x5" && method !== "3x3") return null;
  const max = METHOD_RATING_MAX[method];
  return inRange(h.likelihood, max) && inRange(h.severity, max) ? { likelihood: h.likelihood, severity: h.severity } : null;
}
