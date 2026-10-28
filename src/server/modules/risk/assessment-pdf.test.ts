import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { answerRows, documentSuggestion, formatDay, pdfFileName, type PrintableAssessment } from "@/lib/risk/assessment-print";
import { defaultRiskSettings } from "@/lib/forms/settings";
import { isWinAnsi, renderAssessmentPdf, sanitizePdfText, wrapText } from "./assessment-pdf";
import type { HazardDto } from "./risk.dto";

function hazard(i: number, overrides: Partial<HazardDto> = {}): HazardDto {
  return {
    id: `h${i}`,
    activity: "Loading bay",
    name: `Hazard ${i}`,
    consequence: "Crush injury",
    controls: "Segregated walkways, banksman, speed limit 5 km/h",
    recommendation: "Install barrier",
    justification: "Frequent pedestrian traffic",
    likelihood: 4,
    severity: 5,
    factors: null,
    checklistResult: null,
    score: 20,
    band: "CRITICAL",
    openTasks: 0,
    ...overrides,
  };
}

function assessment(overrides: Partial<PrintableAssessment> = {}): PrintableAssessment {
  return {
    reference: "RA-2026-0001",
    title: "Forklift operations",
    description: "Loading and unloading trucks in the warehouse.",
    status: "APPROVED",
    revision: 2,
    method: "5x5",
    domain: "HEALTH_SAFETY",
    rules: defaultRiskSettings("5x5"),
    form: {
      formId: "f1",
      versionId: "v1",
      version: 3,
      name: "Health & Safety 5×5",
      siteId: null,
      capturedAt: "2026-10-01T09:00:00.000Z",
      fields: [
        { key: "riskTitle", label: "Risk title", type: "text", system: true },
        { key: "extra", label: "Extra notes", type: "heading" },
        { key: "ppe", label: "PPE required", type: "boolean" },
        { key: "supervisor", label: "Supervisor", type: "person" },
        { key: "notes", label: "Notes", type: "textarea" },
      ],
    },
    answers: { riskTitle: "Forklift operations", ppe: true, supervisor: "u2", notes: "" },
    placement: { businessUnitId: null, siteId: "s1", locationId: null, departmentId: "d1", siteName: "Dublin Plant", locationName: null, departmentName: "Warehouse" },
    owner: { id: "u1", name: "Helen Byrne" },
    approver: { id: "u2", name: "Sam Kelly" },
    participants: [{ id: "u3", name: "Emma Walsh" }],
    reviewDate: "2027-03-12",
    itemType: "Forklift",
    itemIdentity: "FL-07",
    operationMode: "Normal",
    workArea: "Loading bay",
    peopleExposed: "Drivers, pickers",
    impactContext: null,
    score: 20,
    band: "CRITICAL",
    isConfidential: null,
    hazards: [hazard(1), hazard(2, { score: 6, band: "LOW", likelihood: 2, severity: 3 })],
    revisions: [
      { id: "r2", revision: 2, date: "2026-09-01", action: "TASK_RESCORE", comment: "Barrier installed", score: 10, band: "MEDIUM", hazards: [], taskId: "t1", taskReference: "RT-2026-0001", actorName: "Sam Kelly" },
      { id: "r1", revision: 1, date: "2026-03-01", action: "APPROVED", comment: null, score: 15, band: "HIGH", hazards: [], taskId: null, taskReference: null, actorName: "Sam Kelly" },
    ],
    reviews: [{ id: "rv1", reviewDate: "2026-06-01", comment: "Still valid", nextReviewDate: "2027-03-12", reviewerName: "Helen Byrne", revision: 1, score: 15, createdAt: "2026-06-01T10:00:00.000Z" }],
    submittedAt: "2026-02-20T10:00:00.000Z",
    approvedAt: "2026-03-01T10:00:00.000Z",
    approvedByName: "Sam Kelly",
    lastReviewedAt: "2026-06-01",
    archivedAt: null,
    ...overrides,
  } as PrintableAssessment;
}

const base = { organizationName: "Northstar Logistics", printedBy: "Helen Byrne", printedOn: "28 Oct 2026", formatDate: (v: string | null | undefined) => formatDay(v, "Europe/Dublin"), personName: () => "Sam Kelly" };

const header = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5));

describe("sanitizePdfText", () => {
  it("keeps WinAnsi text (accents, € – “ ” · ×) unchanged", () => {
    const text = "Café crème – “quoted” · 5×5 € 10 … Ünïcödé ß";
    expect(sanitizePdfText(text)).toBe(text);
  });

  it("maps symbols to ASCII and replaces unsupported characters", () => {
    expect(sanitizePdfText("Score ≥ 15 → act ≤ 3 ✓")).toBe("Score >= 15 -> act <= 3 v");
    expect(sanitizePdfText("Łódź Gdańsk ő")).toBe("Lódz Gdansk o");
    expect(sanitizePdfText("中文 😀")).toBe("?? ?");
    expect(sanitizePdfText("👍🏽 ❤️ zero​width soft­hyphen")).toBe("? ? zerowidth softhyphen");
    expect(sanitizePdfText("tab\there\r\nnext")).toBe("tab  here\nnext");
    expect(sanitizePdfText(null)).toBe("");
  });

  it("only ever outputs characters Helvetica can encode", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const supported = new Set(font.getCharacterSet());
    const nasty = "Ελληνικά Русский 日本語 العربية 🚀🔥 ∑∫√∞ ≠≈ ←→↑↓ ☐☑ \u0007  ﬁ ½ Œuvre ™ • — ‰";
    const out = sanitizePdfText(nasty).replace(/\n/g, "");
    for (const ch of out) {
      expect(isWinAnsi(ch.codePointAt(0)!)).toBe(true);
      expect(supported.has(ch.codePointAt(0)!)).toBe(true);
    }
    expect(() => font.encodeText(out)).not.toThrow();
  });
});

describe("wrapText", () => {
  const measure = (s: string) => s.length;

  it("wraps on words within the width and keeps paragraphs", () => {
    expect(wrapText("one two three four", 9, measure)).toEqual(["one two", "three", "four"]);
    expect(wrapText("a\n\nb", 10, measure)).toEqual(["a", "", "b"]);
    expect(wrapText("\n\n  ", 10, measure)).toEqual([]);
  });

  it("breaks words longer than a line", () => {
    const lines = wrapText("abcdefghijklmnopqrstuvwxyz", 10, measure);
    expect(lines).toEqual(["abcdefghij", "klmnopqrst", "uvwxyz"]);
    expect(lines.every((l) => l.length <= 10)).toBe(true);
  });
});

describe("renderAssessmentPdf", () => {
  it("produces a PDF", async () => {
    const bytes = await renderAssessmentPdf({ ...base, assessment: assessment() });
    expect(header(bytes)).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeLessThanOrEqual(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
    expect(doc.getTitle()).toBe("RA-2026-0001 – Forklift operations");
  });

  it("wraps long text onto more pages and splits huge table rows", async () => {
    const long = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(400);
    const many = Array.from({ length: 30 }, (_, i) => hazard(i + 1, { controls: i === 3 ? long : "Guarding and training" }));
    const bytes = await renderAssessmentPdf({ ...base, assessment: assessment({ description: long, hazards: many }) });
    expect(header(bytes)).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(5);
  });

  it("never crashes on characters outside WinAnsi", async () => {
    const bytes = await renderAssessmentPdf({
      ...base,
      printedBy: "Zoë 李",
      assessment: assessment({ title: "Fork → lift ≥ 2 t 🚜 日本", description: "Ελληνικά\tтекст ✓", hazards: [hazard(1, { name: "Noise ≥ 85 dB(A) 🔊", controls: "Ear defenders → zone" })] }),
    });
    expect(header(bytes)).toBe("%PDF-");
  });

  it("handles an empty draft (no hazards, no revisions, no reviews, no score)", async () => {
    const bytes = await renderAssessmentPdf({
      ...base,
      assessment: assessment({ status: "DRAFT", revision: 0, score: null, band: null, hazards: [], revisions: [], reviews: [], title: "", approvedAt: null, approvedByName: null }),
    });
    expect(header(bytes)).toBe("%PDF-");
  });
});

describe("print helpers", () => {
  it("formats days without time-zone surprises", () => {
    expect(formatDay("2026-03-12")).toBe("12 Mar 2026");
    expect(formatDay("2026-09-30T23:30:00.000Z", "Europe/Dublin")).toBe("1 Oct 2026");
    expect(formatDay(null)).toBe("—");
  });

  it("lists custom answers with names and skips system questions", () => {
    const rows = answerRows(assessment(), (id) => (id === "u2" ? "Sam Kelly" : "?"));
    expect(rows).toEqual([
      { kind: "heading", label: "Extra notes" },
      { kind: "answer", label: "PPE required", value: "Yes" },
      { kind: "answer", label: "Supervisor", value: "Sam Kelly" },
      { kind: "answer", label: "Notes", value: "Not answered" },
    ]);
  });

  it("suggests an ASCII file name and a document title / description", () => {
    expect(pdfFileName({ reference: "RA-2026-0001", title: "Forklift / pedestrian → zone ü", revision: 2 })).toBe("RA-2026-0001 Forklift pedestrian zone u rev 2.pdf");
    expect(pdfFileName({ reference: "RA-2026-0002", title: "", revision: 0 })).toBe("RA-2026-0002.pdf");
    expect(documentSuggestion(assessment(), "28 Oct 2026")).toEqual({
      title: "RA-2026-0001 – Forklift operations",
      description: "Risk assessment RA-2026-0001, revision 2, critical risk. Exported 28 Oct 2026.",
    });
  });
});
