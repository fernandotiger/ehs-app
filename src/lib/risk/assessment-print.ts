import { fieldsForSite, formatAnswer, isEmptyValue, visibleFields, type FileAnswer } from "@/lib/forms";
import type { AssessmentDetailDto, HazardSnapshot } from "@/server/modules/risk/risk.dto";
import { ASSESSMENT_STATUS_LABELS, CHECKLIST_RESULT_LABELS, hazardWordTitle } from "./labels";
import { FMEA_FACTORS, RISK_BAND_LABELS, RISK_DOMAIN_LABELS, RISK_METHOD_LABELS, reviewFrequencyLabel, type RiskBand, type RiskDomain } from "./scoring";

/**
 * Printable content of a risk assessment, shared by the Print page (browser) and the PDF export
 * (server, `src/server/modules/risk/assessment-pdf.ts`) so both show the same rows.
 * Pure: dates are formatted by the caller-supplied formatter.
 */

/** The fields of the assessment detail the print-out uses. */
export type PrintableAssessment = Pick<
  AssessmentDetailDto,
  | "reference"
  | "title"
  | "description"
  | "status"
  | "revision"
  | "method"
  | "domain"
  | "rules"
  | "form"
  | "answers"
  | "placement"
  | "owner"
  | "approver"
  | "participants"
  | "reviewDate"
  | "itemType"
  | "itemIdentity"
  | "operationMode"
  | "workArea"
  | "peopleExposed"
  | "impactContext"
  | "score"
  | "band"
  | "isConfidential"
  | "hazards"
  | "revisions"
  | "reviews"
  | "submittedAt"
  | "approvedAt"
  | "approvedByName"
  | "lastReviewedAt"
  | "archivedAt"
>;

/** Formats yyyy-mm-dd or an ISO timestamp as "12 Mar 2026"; "—" when empty. */
export type DateFormatter = (value: string | null | undefined) => string;

export interface PrintRow {
  label: string;
  /** Empty string = not filled in (rendered as "—"). */
  value: string;
}

export type AnswerRow = { kind: "heading"; label: string } | { kind: "answer"; label: string; value: string };

/** Form questions the assessment shows in its own sections (scope, hazards, score). */
export const RISK_SYSTEM_FIELD_KEYS = ["riskTitle", "hazard", "site", "likelihood", "severity", "riskScore", "owner", "reviewDate"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Calendar date (yyyy-mm-dd) of an instant in a time zone. */
export function localDay(value: Date, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

/** "2026-03-12" or an ISO timestamp (shown in `timeZone`) → "12 Mar 2026". */
export function formatDay(value: string | null | undefined, timeZone?: string): string {
  if (!value) return "—";
  let day = value.slice(0, 10);
  if (value.length > 10) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    day = localDay(date, timeZone);
  }
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d || m > 12) return "—";
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function bandLabel(band: RiskBand | null | undefined): string {
  return band ? RISK_BAND_LABELS[band] : "";
}

/** "20 · Critical", "72", "Not scored". */
export function scoreText(score: number | null | undefined, band: RiskBand | null | undefined): string {
  if (score === null || score === undefined) return "Not scored";
  const label = bandLabel(band);
  return label ? `${score} · ${label}` : String(score);
}

/** The rating values behind a hazard score, e.g. "L 4 × S 5", "S 6.0 × L 4.0 × D 3.0", "No". */
export function hazardRatingText(a: Pick<PrintableAssessment, "method" | "domain">, h: HazardSnapshot): string {
  if (a.method === "CHECKLIST") return h.checklistResult ? CHECKLIST_RESULT_LABELS[h.checklistResult] : "";
  if (a.method === "FMEA") {
    const factors = FMEA_FACTORS[a.domain === "ENVIRONMENT" ? "ENVIRONMENT" : "HEALTH_SAFETY"];
    const avg = (g: string) => {
      const list = factors.filter((f) => f.group === g).map((f) => h.factors?.[f.key]).filter((v): v is number => v !== undefined);
      return list.length ? (list.reduce((s, v) => s + v, 0) / list.length).toFixed(1) : "—";
    };
    return `S ${avg("severity")} × L ${avg("likelihood")} × D ${avg("detection")}`;
  }
  return h.likelihood && h.severity ? `L ${h.likelihood} × S ${h.severity}` : "";
}

export function placementText(p: PrintableAssessment["placement"]): string {
  return [p.siteName, p.locationName, p.departmentName].filter(Boolean).join(" · ");
}

export function methodText(a: Pick<PrintableAssessment, "method" | "domain">): string {
  return `${RISK_METHOD_LABELS[a.method]} · ${RISK_DOMAIN_LABELS[a.domain as RiskDomain] ?? a.domain}`;
}

/** One line under the title: "Approved · Revision 2 · 5×5 matrix · Health & Safety". */
export function statusLine(a: Pick<PrintableAssessment, "status" | "revision" | "method" | "domain">): string {
  return [ASSESSMENT_STATUS_LABELS[a.status], a.revision > 0 ? `Revision ${a.revision}` : "Not approved yet", methodText(a)].join(" · ");
}

/** Scope: where, who, when and the activity fields. */
export function scopeRows(a: PrintableAssessment, fmt: DateFormatter): PrintRow[] {
  const rows: PrintRow[] = [
    { label: "Where", value: placementText(a.placement) },
    { label: "Responsible person", value: a.owner?.name ?? "" },
    { label: "Approver", value: a.approver?.name ?? "" },
    { label: "Participants", value: a.participants.map((p) => p.name).join(", ") },
    { label: "Review date", value: a.reviewDate ? fmt(a.reviewDate) : "" },
    {
      label: "Risk form",
      value: `${a.form.name} v${a.form.version} · ${methodText(a)} · ${reviewFrequencyLabel(a.rules.reviewMonths).toLowerCase()}${
        a.rules.thresholds ? ` · Medium ${a.rules.thresholds.medium} / High ${a.rules.thresholds.high} / Critical ${a.rules.thresholds.critical}` : ""
      }`,
    },
    { label: "Activity / item", value: [a.itemType, a.itemIdentity].filter(Boolean).join(" · ") },
    { label: "Operation mode", value: a.operationMode ?? "" },
    { label: "Work area", value: a.workArea ?? "" },
    a.domain === "ENVIRONMENT" ? { label: "Impact context", value: a.impactContext ?? "" } : { label: "People exposed", value: a.peopleExposed ?? "" },
    { label: "Activity description", value: a.description ?? "" },
  ];
  if (a.isConfidential) rows.push({ label: "Confidential", value: "Yes – handle with care" });
  return rows;
}

/** Custom questions of the captured Risk form (headings kept, system questions left out). */
export function answerRows(a: Pick<PrintableAssessment, "form" | "answers">, nameOf: (userId: string) => string): AnswerRow[] {
  const fields = visibleFields(fieldsForSite(a.form.fields, a.form.siteId), a.answers).filter((f) => !RISK_SYSTEM_FIELD_KEYS.includes(f.key) && f.type !== "score");
  const rows: AnswerRow[] = [];
  for (const field of fields) {
    if (field.type === "heading") {
      rows.push({ kind: "heading", label: field.label });
      continue;
    }
    const value = a.answers[field.key];
    let shown: string;
    if (isEmptyValue(value)) shown = "Not answered";
    else if (field.type === "person") shown = nameOf(String(value));
    else if (field.type === "file") shown = (Array.isArray(value) ? (value as FileAnswer[]) : []).map((f) => f.fileName).join(", ") || formatAnswer(field, value);
    else shown = formatAnswer(field, value);
    rows.push({ kind: "answer", label: field.label, value: shown });
  }
  // A form with only headings left has nothing to print.
  return rows.some((r) => r.kind === "answer") ? rows : [];
}

/** Person ids answered in the custom questions (to resolve names). */
export function personAnswerIds(a: Pick<PrintableAssessment, "form" | "answers">): string[] {
  const ids = a.form.fields.filter((f) => f.type === "person" && typeof a.answers[f.key] === "string").map((f) => a.answers[f.key] as string);
  return [...new Set(ids)];
}

/** Approval and review summary. */
export function approvalRows(a: PrintableAssessment, fmt: DateFormatter): PrintRow[] {
  const rows: PrintRow[] = [{ label: "Status", value: ASSESSMENT_STATUS_LABELS[a.status] }];
  if (a.submittedAt) rows.push({ label: "Submitted for approval", value: fmt(a.submittedAt) });
  rows.push({
    label: "Approved",
    value: a.revision > 0 ? `Revision ${a.revision}${a.approvedAt ? ` · ${fmt(a.approvedAt)}` : ""}${a.approvedByName ? ` · ${a.approvedByName}` : ""}` : "Not approved yet",
  });
  rows.push({ label: "Last periodic review", value: a.lastReviewedAt ? fmt(a.lastReviewedAt) : "None yet" });
  rows.push({ label: "Next review date", value: a.reviewDate ? fmt(a.reviewDate) : "" });
  if (a.archivedAt) rows.push({ label: "Archived", value: fmt(a.archivedAt) });
  return rows;
}

export function hazardsTitle(domain: string): string {
  return hazardWordTitle(domain, true);
}

/** Suggested title / description for the document made from the PDF. */
export function documentSuggestion(a: Pick<PrintableAssessment, "reference" | "title" | "revision" | "score" | "band">, exportedOn: string): { title: string; description: string } {
  const title = `${a.reference} – ${a.title.trim() || "Risk assessment"}`.slice(0, 200);
  const level = a.band ? `${RISK_BAND_LABELS[a.band].toLowerCase()} risk` : a.score !== null ? `score ${a.score}` : "not scored yet";
  const revision = a.revision > 0 ? `revision ${a.revision}` : "not approved yet";
  return { title, description: `Risk assessment ${a.reference}, ${revision}, ${level}. Exported ${exportedOn}.` };
}

/** "RA-2026-0001 Forklift operations rev 2.pdf" – ASCII only, safe in any storage. */
export function pdfFileName(a: Pick<PrintableAssessment, "reference" | "title" | "revision">): string {
  const ascii = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9 ._()-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const title = ascii(a.title).slice(0, 80).trim();
  const base = [ascii(a.reference), title, a.revision > 0 ? `rev ${a.revision}` : ""].filter(Boolean).join(" ") || "Risk assessment";
  return `${base}.pdf`;
}
