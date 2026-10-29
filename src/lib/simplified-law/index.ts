/**
 * Simplified law – shared vocabulary (client + server). Kept apart from the Law module (src/lib/law)
 * so either module can be removed without touching the other. Rules: ./rules.ts.
 */

export const SLAW_MODULE = "simplified-law" as const;
export const SLAW_BASE = "/simplified-law";

/** Entity types used by the audit trail, evidence and the due-work registry. */
export const SLAW_LEGISLATION_ENTITY = "SlawLegislation";
export const SLAW_REQUIREMENT_ENTITY = "SlawRequirement";
export const SLAW_CATEGORY_ENTITY = "SlawCategory";
export const SLAW_SETTINGS_ENTITY = "SlawSettings";

export const slawLegislationHref = (id: string, step?: SlawStepTab) => `${SLAW_BASE}/legislation/${id}${step && step !== "overview" ? `?step=${step}` : ""}`;
export const slawActionHref = (requirementId: string) => `${SLAW_BASE}/actions?open=${requirementId}`;

export const LEGAL_STATUSES = ["ACTIVE", "AFFECTED", "SUPERSEDED", "REPEALED"] as const;
export type LegalStatusKey = (typeof LEGAL_STATUSES)[number];

/** Default wording; a company can change it in Simplified law → Configuration → Settings. */
export const DEFAULT_STATUS_LABELS: Record<LegalStatusKey, string> = {
  ACTIVE: "Active",
  AFFECTED: "Partially affected",
  SUPERSEDED: "Superseded",
  REPEALED: "Repealed",
};

export const STATUS_HINTS: Record<LegalStatusKey, string> = {
  ACTIVE: "In force.",
  AFFECTED: "In force, but partly changed or replaced by newer law.",
  SUPERSEDED: "Replaced by newer law, still listed for reference.",
  REPEALED: "No longer in force – shown greyed and nothing to check.",
};

export type StatusLabels = Record<LegalStatusKey, string>;

export function statusLabels(stored: unknown): StatusLabels {
  const out = { ...DEFAULT_STATUS_LABELS };
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const key of LEGAL_STATUSES) {
      const value = (stored as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
    }
  }
  return out;
}

export const APPLICABILITY = ["NOT_CHECKED", "APPLIES", "DOES_NOT_APPLY"] as const;
export type ApplicabilityKey = (typeof APPLICABILITY)[number];
export const APPLICABILITY_LABELS: Record<ApplicabilityKey, string> = {
  NOT_CHECKED: "Not checked yet",
  APPLIES: "Applies to us",
  DOES_NOT_APPLY: "Does not apply",
};

export const ANSWERS = ["YES", "NO"] as const;
export type AnswerKey = (typeof ANSWERS)[number];

export const COMPLIANCE = ["NOT_ASSESSED", "COMPLIANT", "NOT_COMPLIANT", "NOT_APPLICABLE"] as const;
export type ComplianceKey = (typeof COMPLIANCE)[number];
export const COMPLIANCE_LABELS: Record<ComplianceKey, string> = {
  NOT_ASSESSED: "Not assessed",
  COMPLIANT: "Compliant",
  NOT_COMPLIANT: "Not compliant",
  NOT_APPLICABLE: "N/A",
};
export const COMPLIANCE_HINTS: Record<ComplianceKey, string> = {
  NOT_ASSESSED: "Not looked at yet.",
  COMPLIANT: "We meet it – say how (evidence).",
  NOT_COMPLIANT: "We do not meet it yet – set an action, an owner and a due date.",
  NOT_APPLICABLE: "This requirement does not apply to us – skipped.",
};

export const ACTION_STATUSES = ["NONE", "OPEN", "DONE"] as const;
export type SlawActionStatusKey = (typeof ACTION_STATUSES)[number];

/** Tabs of the legislation page (storyboard steps 3–5) – `?step=` in the URL. */
export const STEP_TABS = ["overview", "applicability", "requirements", "history"] as const;
export type SlawStepTab = (typeof STEP_TABS)[number];

export function isStepTab(value: string | null | undefined): value is SlawStepTab {
  return (STEP_TABS as readonly string[]).includes(value ?? "");
}

/** Legislation-list filter "Our check". */
export const CHECK_FILTERS = ["NOT_CHECKED", "APPLIES", "DOES_NOT_APPLY", "NOT_COMPLIANT"] as const;
export type CheckFilterKey = (typeof CHECK_FILTERS)[number];
export const CHECK_FILTER_LABELS: Record<CheckFilterKey, string> = {
  NOT_CHECKED: "Not checked yet",
  APPLIES: "Applies to us",
  DOES_NOT_APPLY: "Does not apply",
  NOT_COMPLIANT: "Something not compliant",
};

export const DEFAULT_REGISTER_TITLE = "Legislation & Compliance Register";
export const DEFAULT_JURISDICTIONS = ["EU", "Ireland"];
export const DEFAULT_ACTION_DAYS = 30;

export const SLAW_LIMITS = {
  name: 120,
  title: 300,
  short: 80,
  summary: 4000,
  text: 2000,
  reason: 2000,
  url: 1000,
  roles: 8,
  jurisdictions: 30,
} as const;
