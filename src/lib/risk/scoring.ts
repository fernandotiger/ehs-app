/**
 * Risk scoring – pure maths shared by Form Builder (risk rules), the Risk module and tests.
 *
 * Methods (spec risk.md "Scoring rules"):
 *   5×5 / 3×3  likelihood × severity (values 1–5 / 1–3)
 *   FMEA       round(avg severity factors × avg likelihood factors × avg detection factors), factors 1–10
 *   CHECKLIST  a "No" contributes 1, "Yes" / "Not applicable" contribute 0
 * The overall assessment score is the HIGHEST hazard/aspect score (never a sum or average).
 * Banding is inclusive at each boundary: Critical ≥ critical, else High ≥ high, else Medium ≥ medium, else Low.
 */

export const RISK_METHODS = ["5x5", "3x3", "FMEA", "CHECKLIST"] as const;
export type RiskMethod = (typeof RISK_METHODS)[number];

export const RISK_METHOD_LABELS: Record<RiskMethod, string> = {
  "5x5": "5×5 matrix",
  "3x3": "3×3 matrix",
  FMEA: "FMEA",
  CHECKLIST: "Checklist",
};

export const RISK_DOMAINS = ["HEALTH_SAFETY", "ENVIRONMENT"] as const;
export type RiskDomain = (typeof RISK_DOMAINS)[number];

export const RISK_DOMAIN_LABELS: Record<RiskDomain, string> = {
  HEALTH_SAFETY: "Health & Safety",
  ENVIRONMENT: "Environment",
};

export function isRiskMethod(value: string): value is RiskMethod {
  return (RISK_METHODS as readonly string[]).includes(value);
}

/** Highest possible score per method (thresholds must stay within it). */
export const METHOD_MAX_SCORE: Record<RiskMethod, number> = { "5x5": 25, "3x3": 9, FMEA: 1000, CHECKLIST: 1 };

/** Allowed rating range for one likelihood/severity value (or FMEA factor). */
export const METHOD_RATING_MAX: Record<RiskMethod, number> = { "5x5": 5, "3x3": 3, FMEA: 10, CHECKLIST: 1 };

export interface RiskThresholds {
  medium: number;
  high: number;
  critical: number;
}

export const DEFAULT_THRESHOLDS: Record<Exclude<RiskMethod, "CHECKLIST">, RiskThresholds> = {
  "5x5": { medium: 5, high: 10, critical: 20 },
  "3x3": { medium: 3, high: 6, critical: 9 },
  FMEA: { medium: 50, high: 250, critical: 500 },
};

/** Review frequency options in months: six months or one to five years. */
export const REVIEW_FREQUENCIES = [6, 12, 24, 36, 48, 60] as const;
export type ReviewFrequencyMonths = (typeof REVIEW_FREQUENCIES)[number];

export function reviewFrequencyLabel(months: number): string {
  if (months === 6) return "Every 6 months";
  const years = months / 12;
  return years === 1 ? "Every year" : `Every ${years} years`;
}

/** Thresholds for a method (null for Checklist, which has no numeric bands). */
export function defaultThresholds(method: RiskMethod): RiskThresholds | null {
  return method === "CHECKLIST" ? null : { ...DEFAULT_THRESHOLDS[method] };
}

/**
 * Validates Medium/High/Critical starting values. Returns a readable message or null.
 * Boundaries must be whole numbers ≥ 1, strictly increasing and within the method maximum.
 */
export function validateThresholds(method: RiskMethod, thresholds: RiskThresholds | null | undefined): string | null {
  if (method === "CHECKLIST") return thresholds ? "Checklist scoring has no numeric risk thresholds." : null;
  if (!thresholds) return "Enter the Medium, High and Critical starting values.";
  const { medium, high, critical } = thresholds;
  const values = [medium, high, critical];
  if (!values.every((v) => Number.isInteger(v) && v >= 1)) return "Thresholds must be whole numbers of at least 1.";
  if (!(medium < high && high < critical)) return "Thresholds must increase from Medium to High to Critical.";
  const max = METHOD_MAX_SCORE[method];
  if (critical > max) return `Thresholds must stay within the ${RISK_METHOD_LABELS[method]} maximum score of ${max}.`;
  return null;
}

// ── FMEA factor groups ──────────────────────────────────────────────────────

export type FmeaGroup = "severity" | "likelihood" | "detection";

export interface FmeaFactor {
  key: string;
  label: string;
  group: FmeaGroup;
}

const DETECTION: FmeaFactor[] = [
  { key: "monitoring", label: "Monitoring / inspections", group: "detection" },
  { key: "incidentHistory", label: "Incident history", group: "detection" },
  { key: "equipmentReliability", label: "Equipment reliability", group: "detection" },
  { key: "warningSystems", label: "Warning systems", group: "detection" },
  { key: "managementAudit", label: "Management system audit", group: "detection" },
];

export const FMEA_FACTORS: Record<RiskDomain, FmeaFactor[]> = {
  HEALTH_SAFETY: [
    { key: "peopleExposed", label: "Number of people at risk", group: "severity" },
    { key: "sensitivity", label: "Sensitivity of people", group: "severity" },
    { key: "exposureDuration", label: "Duration of exposure", group: "severity" },
    { key: "harm", label: "Nature of hazard / harm", group: "severity" },
    { key: "regulatoryLimits", label: "Regulatory limits", group: "severity" },
    { key: "workplaceDesign", label: "Workplace design", group: "likelihood" },
    { key: "engineeringControls", label: "Engineering controls", group: "likelihood" },
    { key: "administrativeControls", label: "Administrative controls", group: "likelihood" },
    { key: "competency", label: "Competency", group: "likelihood" },
    { key: "equipmentPpe", label: "Work equipment / PPE", group: "likelihood" },
    ...DETECTION,
  ],
  ENVIRONMENT: [
    { key: "scale", label: "Scale and spread", group: "severity" },
    { key: "pollutantVolumes", label: "Volumes of pollutants", group: "severity" },
    { key: "duration", label: "Duration of impact", group: "severity" },
    { key: "toxicity", label: "Toxicity", group: "severity" },
    { key: "locationSensitivity", label: "Sensitivity of location", group: "severity" },
    { key: "regulatoryLimits", label: "Regulatory limits", group: "severity" },
    { key: "activityFrequency", label: "Activity frequency", group: "likelihood" },
    { key: "abatement", label: "Abatement", group: "likelihood" },
    { key: "containment", label: "Containment", group: "likelihood" },
    { key: "competency", label: "Competency", group: "likelihood" },
    { key: "controlDocumentation", label: "Control documentation", group: "likelihood" },
    ...DETECTION,
  ],
};

function assertRating(value: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new RangeError(`${label} must be a whole number from 1 to ${max}`);
}

/** 5×5 or 3×3: likelihood × severity. */
export function matrixScore(method: "5x5" | "3x3", likelihood: number, severity: number): number {
  const max = METHOD_RATING_MAX[method];
  assertRating(likelihood, max, "Likelihood");
  assertRating(severity, max, "Severity");
  return likelihood * severity;
}

/** Average rating of one FMEA group (every factor of the group must be rated 1–10). */
export function fmeaGroupAverage(domain: RiskDomain, group: FmeaGroup, ratings: Record<string, number>): number {
  const factors = FMEA_FACTORS[domain].filter((f) => f.group === group);
  const values = factors.map((f) => {
    const v = ratings[f.key];
    if (v === undefined) throw new RangeError(`Rate "${f.label}"`);
    assertRating(v, 10, f.label);
    return v;
  });
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** FMEA risk priority number: rounded product of the three group averages (1–1000). */
export function fmeaScore(domain: RiskDomain, ratings: Record<string, number>): number {
  return Math.round(fmeaGroupAverage(domain, "severity", ratings) * fmeaGroupAverage(domain, "likelihood", ratings) * fmeaGroupAverage(domain, "detection", ratings));
}

export type ChecklistResult = "YES" | "NO" | "NOT_APPLICABLE";

export function checklistScore(result: ChecklistResult): 0 | 1 {
  return result === "NO" ? 1 : 0;
}

export type HazardScoreInput =
  | { method: "5x5" | "3x3"; likelihood: number; severity: number }
  | { method: "FMEA"; domain: RiskDomain; ratings: Record<string, number> }
  | { method: "CHECKLIST"; result: ChecklistResult };

export function hazardScore(input: HazardScoreInput): number {
  switch (input.method) {
    case "5x5":
    case "3x3":
      return matrixScore(input.method, input.likelihood, input.severity);
    case "FMEA":
      return fmeaScore(input.domain, input.ratings);
    case "CHECKLIST":
      return checklistScore(input.result);
  }
}

/** Overall assessment score = highest hazard/aspect score (0 when there are none). */
export function overallScore(scores: readonly number[]): number {
  return scores.length ? Math.max(...scores) : 0;
}

export const RISK_BANDS = ["LOW", "MEDIUM", "HIGH", "CRITICAL", "SATISFACTORY", "ACTION_REQUIRED"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export const RISK_BAND_LABELS: Record<RiskBand, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
  SATISFACTORY: "Satisfactory",
  ACTION_REQUIRED: "Action required",
};

/** Classification of a score (inclusive at each boundary). Checklist: Satisfactory at 0, Action required at 1. */
export function riskBand(score: number, method: RiskMethod, thresholds?: RiskThresholds | null): RiskBand {
  if (method === "CHECKLIST") return score > 0 ? "ACTION_REQUIRED" : "SATISFACTORY";
  const t = thresholds ?? DEFAULT_THRESHOLDS[method];
  if (score >= t.critical) return "CRITICAL";
  if (score >= t.high) return "HIGH";
  if (score >= t.medium) return "MEDIUM";
  return "LOW";
}
