import "server-only";
import { PageSizes, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import {
  answerRows,
  approvalRows,
  bandLabel,
  hazardRatingText,
  hazardsTitle,
  scopeRows,
  scoreText,
  statusLine,
  type DateFormatter,
  type PrintableAssessment,
  type PrintRow,
} from "@/lib/risk/assessment-print";
import { hazardWordTitle, REVISION_ACTION_LABELS } from "@/lib/risk/labels";
import type { RiskBand } from "@/lib/risk/scoring";

/**
 * Risk assessment → PDF (A4 portrait) with pdf-lib – pure JavaScript, so it runs on Vercel / any
 * Node host without a browser. Same content as the Print page (`assessment-print.ts` rows):
 * header with reference, status, revision and score; scope; hazards / aspects table (header
 * repeated on every page, long rows split across pages); form questions; approval, revisions and
 * periodic reviews; footer "Printed on … by … · Page n of N" on every page.
 *
 * Standard fonts only know WinAnsi (Windows-1252) – every text goes through `sanitizePdfText`
 * so arrows, emoji, CJK … never break the export.
 */

export interface AssessmentPdfInput {
  assessment: PrintableAssessment;
  organizationName: string;
  printedBy: string;
  /** Already formatted, e.g. "28 Oct 2026". */
  printedOn: string;
  formatDate: DateFormatter;
  /** Person answers of the custom questions are user ids. */
  personName: (userId: string) => string;
}

// ── Text: WinAnsi sanitising and wrapping (pure) ───────────────────────────

/** Characters of Windows-1252 outside Latin-1 (0x80–0x9F block). */
const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013,
  0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const REPLACEMENTS: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "↔": "<->",
  "⇒": "=>",
  "⇐": "<=",
  "↑": "^",
  "↓": "v",
  "≥": ">=",
  "≤": "<=",
  "≠": "!=",
  "≈": "~",
  "−": "-",
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "―": "-",
  "′": "'",
  "″": '"',
  "‹": "<",
  "›": ">",
  "✓": "v",
  "✔": "v",
  "✗": "x",
  "✘": "x",
  "★": "*",
  "☆": "*",
  "●": "•",
  "○": "o",
  "▪": "•",
  "■": "•",
  "□": "[ ]",
  "☐": "[ ]",
  "☑": "[x]",
  "☒": "[x]",
  "∞": "infinity",
  "√": "v",
  "⚠": "!",
  // Latin letters without a decomposition.
  Ł: "L",
  ł: "l",
  Đ: "D",
  đ: "d",
  Ħ: "H",
  ħ: "h",
  ı: "i",
  Ŋ: "N",
  ŋ: "n",
  ĸ: "k",
  Ŧ: "T",
  ŧ: "t",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": "\n",
  " ": "\n",
};

/** True when a standard PDF font (WinAnsi encoding) can draw this code point. */
export function isWinAnsi(codePoint: number): boolean {
  return (codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff) || WIN_ANSI_EXTRA.has(codePoint);
}

const COMBINING_MARKS = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/g;

/** Invisible characters dropped from the output: controls, soft hyphen, zero-width / direction marks,
 * combining marks, variation selectors, emoji skin tones and tag characters. */
function isIgnorable(cp: number): boolean {
  return (
    cp < 0x20 ||
    (cp >= 0x7f && cp < 0xa0) ||
    cp === 0xad ||
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2064) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xfe20 && cp <= 0xfe2f) ||
    cp === 0xfeff ||
    (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    (cp >= 0xe0000 && cp <= 0xe01ef)
  );
}

/**
 * Makes any text drawable with WinAnsi: keeps Latin-1 and the Windows-1252 extras (– — “ ” ‘ ’ € …),
 * maps common symbols to ASCII (→ "->", ≥ ">="), strips accents the encoding lacks (ő → o), drops
 * control / format / combining characters and replaces everything else (emoji, CJK …) with "?".
 * Newlines are kept for wrapping.
 */
export function sanitizePdfText(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\n") out += "\n";
    else if (ch === "\t") out += "  ";
    else if (REPLACEMENTS[ch] !== undefined) out += REPLACEMENTS[ch];
    else if (isIgnorable(cp)) continue;
    else if (isWinAnsi(cp)) out += ch;
    else {
      const base = ch.normalize("NFKD").replace(COMBINING_MARKS, "");
      out += base && [...base].every((c) => isWinAnsi(c.codePointAt(0)!)) ? base : "?";
    }
  }
  return out;
}

/**
 * Wraps text to lines no wider than `maxWidth` (measured by `measure`). Keeps paragraph breaks,
 * breaks words longer than a line. Leading / trailing blank lines are dropped.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      if (measure(word) <= maxWidth) {
        line = word;
        continue;
      }
      for (const ch of word) {
        if (line && measure(line + ch) > maxWidth) {
          lines.push(line);
          line = ch;
        } else line += ch;
      }
    }
    lines.push(line);
  }
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

// ── Layout ──────────────────────────────────────────────────────────────────

const [PAGE_W, PAGE_H] = PageSizes.A4;
const MARGIN = 42;
const FOOTER_H = 26;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BOTTOM = MARGIN + FOOTER_H;

const INK = rgb(0.11, 0.13, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);
const BRAND = rgb(0.231, 0.325, 0.51);
const RULE = rgb(0.84, 0.86, 0.9);
const HEAD_FILL = rgb(0.94, 0.95, 0.97);

const BAND_STYLE: Record<RiskBand, { ink: RGB; fill: RGB }> = {
  LOW: { ink: rgb(0.09, 0.47, 0.25), fill: rgb(0.87, 0.95, 0.89) },
  SATISFACTORY: { ink: rgb(0.09, 0.47, 0.25), fill: rgb(0.87, 0.95, 0.89) },
  MEDIUM: { ink: rgb(0.55, 0.38, 0), fill: rgb(1, 0.95, 0.8) },
  HIGH: { ink: rgb(0.72, 0.31, 0.04), fill: rgb(1, 0.9, 0.82) },
  CRITICAL: { ink: rgb(0.72, 0.1, 0.1), fill: rgb(0.99, 0.88, 0.88) },
  ACTION_REQUIRED: { ink: rgb(0.72, 0.1, 0.1), fill: rgb(0.99, 0.88, 0.88) },
};

function bandStyle(band: RiskBand | null | undefined) {
  return band ? BAND_STYLE[band] : { ink: MUTED, fill: HEAD_FILL };
}

interface Segment {
  text: string;
  bold?: boolean;
  muted?: boolean;
  color?: RGB;
  size?: number;
}
type Cell = Segment[];
interface Column {
  title: string;
  width: number;
}
interface StyledLine {
  text: string;
  font: PDFFont;
  size: number;
  color: RGB;
}

class PdfWriter {
  readonly pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  constructor(
    private readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
  }

  /** Starts a new page unless `height` still fits above the footer. */
  ensure(height: number): boolean {
    if (this.y - height >= BOTTOM) return false;
    this.newPage();
    return true;
  }

  wrap(text: string, width: number, font: PDFFont, size: number): string[] {
    return wrapText(sanitizePdfText(text), width, (s) => font.widthOfTextAtSize(s, size));
  }

  draw(text: string, x: number, y: number, font: PDFFont, size: number, color: RGB = INK, page: PDFPage = this.page) {
    const safe = sanitizePdfText(text).replace(/\n/g, " ");
    if (safe) page.drawText(safe, { x, y, font, size, color });
  }

  /** Wrapped paragraph across pages. */
  paragraph(text: string, opts: { size?: number; bold?: boolean; color?: RGB; gapAfter?: number } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.regular;
    const lh = size * 1.35;
    for (const line of this.wrap(text, CONTENT_W, font, size)) {
      this.ensure(lh);
      this.draw(line, MARGIN, this.y - size, font, size, opts.color ?? INK);
      this.y -= lh;
    }
    this.y -= opts.gapAfter ?? 6;
  }

  heading(title: string) {
    this.y -= 8;
    this.ensure(44);
    this.draw(title, MARGIN, this.y - 12, this.bold, 12, BRAND);
    this.y -= 17;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + CONTENT_W, y: this.y }, thickness: 0.75, color: RULE });
    this.y -= 8;
  }

  subheading(title: string) {
    this.y -= 4;
    this.ensure(30);
    this.draw(title, MARGIN, this.y - 10, this.bold, 10, INK);
    this.y -= 16;
  }

  /** Label / value rows; long values continue on the next page. */
  rows(rows: PrintRow[]) {
    const size = 9.5;
    const lh = size * 1.35;
    const labelW = 132;
    const valueX = MARGIN + labelW + 10;
    const valueW = CONTENT_W - labelW - 10;
    for (const row of rows) {
      const labels = this.wrap(row.label, labelW, this.regular, size);
      const values = row.value.trim() ? this.wrap(row.value, valueW, this.regular, size) : ["—"];
      const n = Math.max(labels.length, values.length, 1);
      // Keep short rows together.
      if (n <= 6) this.ensure(n * lh);
      for (let i = 0; i < n; i++) {
        this.ensure(lh);
        if (labels[i]) this.draw(labels[i]!, MARGIN, this.y - size, this.regular, size, MUTED);
        if (values[i]) this.draw(values[i]!, valueX, this.y - size, this.regular, size, row.value.trim() ? INK : MUTED);
        this.y -= lh;
      }
      this.y -= 3;
    }
  }

  private cellLines(cell: Cell, width: number): StyledLine[] {
    const out: StyledLine[] = [];
    for (const seg of cell) {
      if (!seg.text.trim()) continue;
      const font = seg.bold ? this.bold : this.regular;
      const size = seg.size ?? 8;
      const color = seg.color ?? (seg.muted ? MUTED : INK);
      for (const text of this.wrap(seg.text, width, font, size)) out.push({ text, font, size, color });
    }
    return out.length ? out : [{ text: "—", font: this.regular, size: 8, color: MUTED }];
  }

  /** Table with a shaded header that repeats on every page; tall rows are split across pages. */
  table(columns: Column[], rows: Cell[][]) {
    const pad = 4;
    const lh = 10.5;
    const headerLines = columns.map((c) => this.wrap(c.title, c.width - 2 * pad, this.bold, 8));
    const headerH = Math.max(...headerLines.map((l) => l.length)) * lh + 2 * pad;
    const fullPageLines = Math.floor((PAGE_H - MARGIN - BOTTOM - headerH - 2 * pad) / lh);

    const drawHeader = () => {
      this.ensure(headerH + 2 * lh + 2 * pad);
      this.page.drawRectangle({ x: MARGIN, y: this.y - headerH, width: CONTENT_W, height: headerH, color: HEAD_FILL });
      let x = MARGIN;
      columns.forEach((c, i) => {
        headerLines[i]!.forEach((line, j) => this.draw(line, x + pad, this.y - pad - 8 - j * lh, this.bold, 8, INK));
        x += c.width;
      });
      this.y -= headerH;
    };

    drawHeader();
    for (const row of rows) {
      const cells = row.map((cell, i) => this.cellLines(cell, columns[i]!.width - 2 * pad));
      const total = Math.max(1, ...cells.map((c) => c.length));
      let start = 0;
      let fresh = false;
      while (start < total) {
        const available = Math.floor((this.y - BOTTOM - 2 * pad) / lh);
        const remaining = total - start;
        if (!fresh && available < remaining && (available < 2 || remaining <= fullPageLines)) {
          this.newPage();
          drawHeader();
          fresh = true;
          continue;
        }
        const n = Math.max(1, Math.min(available, remaining));
        const h = n * lh + 2 * pad;
        let x = MARGIN;
        cells.forEach((lines, i) => {
          lines.slice(start, start + n).forEach((line, j) => this.draw(line.text, x + pad, this.y - pad - 8 - j * lh, line.font, line.size, line.color));
          x += columns[i]!.width;
        });
        this.y -= h;
        this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + CONTENT_W, y: this.y }, thickness: 0.5, color: RULE });
        start += n;
        fresh = false;
        if (start < total) {
          this.newPage();
          drawHeader();
          fresh = true;
        }
      }
    }
    this.y -= 6;
  }

  footers(left: string, right: (page: number, total: number) => string) {
    const total = this.pages.length;
    this.pages.forEach((page, i) => {
      page.drawLine({ start: { x: MARGIN, y: MARGIN + 14 }, end: { x: MARGIN + CONTENT_W, y: MARGIN + 14 }, thickness: 0.5, color: RULE });
      const rightText = sanitizePdfText(right(i + 1, total));
      const rightW = this.regular.widthOfTextAtSize(rightText, 7.5);
      const maxLeft = CONTENT_W - rightW - 16;
      let leftText = sanitizePdfText(left).replace(/\n/g, " ");
      if (this.regular.widthOfTextAtSize(leftText, 7.5) > maxLeft) {
        while (leftText.length > 1 && this.regular.widthOfTextAtSize(`${leftText}…`, 7.5) > maxLeft) leftText = leftText.slice(0, -1);
        leftText = `${leftText.trimEnd()}…`;
      }
      this.draw(leftText, MARGIN, MARGIN + 3, this.regular, 7.5, MUTED, page);
      this.draw(rightText, MARGIN + CONTENT_W - rightW, MARGIN + 3, this.regular, 7.5, MUTED, page);
    });
  }
}

// ── Document ────────────────────────────────────────────────────────────────

function drawHeader(w: PdfWriter, input: AssessmentPdfInput) {
  const a = input.assessment;
  const boxW = 128;
  const boxH = 50;
  const top = w.y;

  w.draw(input.organizationName, MARGIN, top - 9, w.regular, 9, MUTED);
  w.draw("RISK ASSESSMENT", MARGIN, top - 22, w.bold, 8, BRAND);

  let y = top - 30;
  const titleLines = w.wrap(a.title || "Untitled draft", CONTENT_W - boxW - 16, w.bold, 16);
  for (const line of titleLines.slice(0, 6)) {
    w.draw(line, MARGIN, y - 16, w.bold, 16, INK);
    y -= 20;
  }
  for (const line of w.wrap(`${a.reference} · ${statusLine(a)}`, CONTENT_W - boxW - 16, w.regular, 9.5)) {
    w.draw(line, MARGIN, y - 10, w.regular, 9.5, MUTED);
    y -= 13;
  }

  // Score box (top right).
  const style = bandStyle(a.band);
  const boxX = MARGIN + CONTENT_W - boxW;
  const boxY = top - 8 - boxH;
  w.page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, color: style.fill, borderColor: style.ink, borderWidth: 0.75 });
  w.draw("Overall score", boxX + 8, boxY + boxH - 13, w.regular, 8, MUTED);
  w.draw(a.score === null ? "Not scored" : String(a.score), boxX + 8, boxY + 17, w.bold, a.score === null ? 12 : 18, style.ink);
  const label = bandLabel(a.band);
  if (label) w.draw(label, boxX + 8, boxY + 6, w.bold, 8, style.ink);

  w.y = Math.min(y, boxY) - 10;
  w.page.drawLine({ start: { x: MARGIN, y: w.y }, end: { x: MARGIN + CONTENT_W, y: w.y }, thickness: 1, color: BRAND });
  w.y -= 6;
}

function hazardTable(w: PdfWriter, a: PrintableAssessment) {
  const word = hazardWordTitle(a.domain);
  const columns: Column[] = [
    { title: "#", width: 18 },
    { title: `${word} / activity`, width: 92 },
    { title: "Consequence", width: 86 },
    { title: "Current controls", width: 112 },
    { title: "Recommendations", width: 104 },
    { title: "Score", width: CONTENT_W - 18 - 92 - 86 - 112 - 104 },
  ];
  const rows: Cell[][] = a.hazards.map((h, i) => {
    const style = bandStyle(h.band);
    return [
      [{ text: String(i + 1), muted: true }],
      [{ text: h.name || "Untitled", bold: true }, { text: h.activity, muted: true }],
      [{ text: h.consequence }],
      [{ text: h.controls }],
      [{ text: h.recommendation ?? "" }],
      [
        { text: hazardRatingText(a, h), muted: true },
        { text: scoreText(h.score, h.band), bold: true, color: style.ink },
        { text: h.justification ? `Why: ${h.justification}` : "", muted: true, size: 7.5 },
      ],
    ];
  });
  w.table(columns, rows);
}

/** Builds the PDF bytes (starts with "%PDF"). */
export async function renderAssessmentPdf(input: AssessmentPdfInput): Promise<Uint8Array> {
  const a = input.assessment;
  const fmt = input.formatDate;
  const doc = await PDFDocument.create();
  doc.setTitle(`${a.reference} – ${a.title || "Risk assessment"}`);
  doc.setSubject("Risk assessment");
  doc.setAuthor(input.printedBy);
  doc.setCreator("OleoQ EHS");
  doc.setProducer("OleoQ EHS");
  doc.setLanguage("en");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new PdfWriter(doc, regular, bold);

  drawHeader(w, input);

  w.heading("Scope");
  w.rows(scopeRows(a, fmt));

  const word = hazardsTitle(a.domain);
  w.heading(`${word} (${a.hazards.length}) · overall = highest score`);
  if (a.hazards.length === 0) w.paragraph(`No ${word.toLowerCase()} recorded yet.`, { color: MUTED });
  else hazardTable(w, a);
  if (a.rules.footnote) w.paragraph(a.rules.footnote, { size: 8, color: MUTED });

  const answers = answerRows(a, input.personName);
  if (answers.length) {
    w.heading(`Form questions · ${a.form.name} v${a.form.version}`);
    let pending: PrintRow[] = [];
    const flush = () => {
      if (pending.length) w.rows(pending);
      pending = [];
    };
    for (const row of answers) {
      if (row.kind === "heading") {
        flush();
        w.subheading(row.label);
      } else pending.push({ label: row.label, value: row.value });
    }
    flush();
  }

  w.heading("Approval and reviews");
  w.rows(approvalRows(a, fmt));

  w.subheading("Score history");
  if (a.revisions.length === 0) w.paragraph("Not approved yet – the first approval creates revision 1.", { color: MUTED });
  else
    w.table(
      [
        { title: "Revision", width: 50 },
        { title: "Date", width: 68 },
        { title: "What happened", width: 100 },
        { title: "Score", width: 74 },
        { title: "By", width: 90 },
        { title: "Comment", width: CONTENT_W - 50 - 68 - 100 - 74 - 90 },
      ],
      a.revisions.map((r) => [
        [{ text: String(r.revision), bold: true }],
        [{ text: fmt(r.date) }],
        [{ text: `${REVISION_ACTION_LABELS[r.action]}${r.taskReference ? ` · ${r.taskReference}` : ""}` }],
        [{ text: scoreText(r.score, r.band), color: bandStyle(r.band).ink, bold: true }],
        [{ text: r.actorName ?? "" }],
        [{ text: r.comment ?? "" }],
      ]),
    );

  w.subheading("Periodic reviews");
  if (a.reviews.length === 0) w.paragraph("No periodic reviews yet.", { color: MUTED });
  else
    w.table(
      [
        { title: "Reviewed", width: 68 },
        { title: "Next review", width: 68 },
        { title: "Reviewer", width: 96 },
        { title: "Revision · score", width: 72 },
        { title: "Comment", width: CONTENT_W - 68 - 68 - 96 - 72 },
      ],
      a.reviews.map((r) => [
        [{ text: fmt(r.reviewDate) }],
        [{ text: fmt(r.nextReviewDate) }],
        [{ text: r.reviewerName ?? "" }],
        [{ text: `${r.revision}${r.score !== null ? ` · ${r.score}` : ""}` }],
        [{ text: r.comment }],
      ]),
    );

  w.footers(`${a.reference} · ${a.title || "Risk assessment"}`, (page, total) => `Printed on ${input.printedOn} by ${input.printedBy} · Page ${page} of ${total}`);
  return doc.save();
}
