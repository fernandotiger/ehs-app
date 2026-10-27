/**
 * Form-level settings per module (stored as JSON on the draft and on every published version).
 *
 * Risk: the form's settings ARE the risk matrix and review rules (spec risk.md "Risk matrix and
 * review rules"). Incident: none at form level (per-question settings live on the fields).
 * Later modules (Audit: method, suggested finding type, sites, mobile …) add their schema here.
 */
import { z } from "zod";
import {
  defaultThresholds,
  REVIEW_FREQUENCIES,
  RISK_DOMAINS,
  RISK_METHODS,
  validateThresholds,
  type RiskDomain,
  type RiskMethod,
  type RiskThresholds,
} from "../risk/scoring";

export interface RiskFormSettings {
  method: RiskMethod;
  domain: RiskDomain;
  /** Medium/High/Critical starting values (null for Checklist). */
  thresholds: RiskThresholds | null;
  /** Review frequency in months: 6, 12, 24, 36, 48 or 60. */
  reviewMonths: number;
  /** Days before the review date that reminders start (0–365). */
  advanceNoticeDays: number;
  /** Sites where the form can be used; empty = all sites. */
  siteIds: string[];
  /** Footnote printed on assessments. */
  footnote: string;
}

const thresholdsSchema = z.object({
  medium: z.number().int(),
  high: z.number().int(),
  critical: z.number().int(),
});

export const riskFormSettingsSchema = z
  .object({
    method: z.enum(RISK_METHODS),
    domain: z.enum(RISK_DOMAINS),
    thresholds: thresholdsSchema.nullable(),
    reviewMonths: z
      .number()
      .int()
      .refine((v) => (REVIEW_FREQUENCIES as readonly number[]).includes(v), "Choose six months or one to five years"),
    advanceNoticeDays: z.number().int().min(0, "Advance notice is 0–365 days").max(365, "Advance notice is 0–365 days"),
    siteIds: z.array(z.string().min(1).max(64)).max(200),
    footnote: z.string().trim().max(500),
  })
  .superRefine((value, ctx) => {
    const message = validateThresholds(value.method, value.thresholds);
    if (message) ctx.addIssue({ code: "custom", path: ["thresholds"], message });
  });

export function defaultRiskSettings(method: RiskMethod, domain: RiskDomain = "HEALTH_SAFETY"): RiskFormSettings {
  return {
    method,
    domain,
    thresholds: defaultThresholds(method),
    reviewMonths: 12,
    advanceNoticeDays: 14,
    siteIds: [],
    footnote: "Review controls whenever the activity or working conditions change.",
  };
}

/** Default settings for a new form. */
export function defaultFormSettings(module: string, purpose: string, input?: { domain?: RiskDomain }): Record<string, unknown> {
  if (module === "risk") return { ...defaultRiskSettings(purpose as RiskMethod, input?.domain) };
  return {};
}

/** Settings issues for a module ({ path, message }); the method always follows the form purpose. */
export function validateFormSettings(module: string, purpose: string, settings: unknown): { path: string; message: string }[] {
  if (module !== "risk") return [];
  const parsed = riskFormSettingsSchema.safeParse(settings);
  const issues = parsed.success ? [] : parsed.error.issues.map((i) => ({ path: ["settings", ...i.path].join("."), message: i.message }));
  if (parsed.success && parsed.data.method !== purpose) issues.push({ path: "settings.method", message: "The scoring method is fixed when the form is created." });
  return issues;
}

export function readRiskSettings(settings: unknown): RiskFormSettings | null {
  const parsed = riskFormSettingsSchema.safeParse(settings);
  return parsed.success ? (parsed.data as RiskFormSettings) : null;
}
