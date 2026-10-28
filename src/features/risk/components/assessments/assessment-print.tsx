"use client";

import { ArrowLeft, FileSearch, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { useUsersByIds } from "@/features/shared/lookups";
import { ApiError } from "@/lib/api-client";
import {
  answerRows,
  approvalRows,
  bandLabel,
  hazardRatingText,
  hazardsTitle,
  personAnswerIds,
  scopeRows,
  scoreText,
  statusLine,
  type PrintRow,
} from "@/lib/risk/assessment-print";
import { hazardWordTitle, REVISION_ACTION_LABELS } from "@/lib/risk/labels";
import type { RiskBand } from "@/lib/risk/scoring";
import { cn } from "@/lib/utils";
import { useAssessment, type AssessmentDetailDto } from "../../api";
import { BAND_CLASSES, formatDate, todayLocal } from "../../format";

/**
 * Print view of an assessment (`/risk/assessments/[id]/print`): the whole record on one page –
 * same rows as the PDF export (`@/lib/risk/assessment-print`). Opens the print dialog once loaded;
 * the app chrome and the toolbar are hidden on paper (globals.css print rules + data-print-hide).
 */
export function AssessmentPrint({ id }: { id: string }) {
  const query = useAssessment(id);
  if (query.isPending) return <LoadingRows rows={6} className="mx-auto max-w-4xl [&>*]:h-20" />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Assessment not found" description="It does not exist or you do not have access to it." className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <PrintSheet a={query.data} />;
}

function PrintSheet({ a }: { a: AssessmentDetailDto }) {
  const { user } = useCurrentUser();
  const personIds = personAnswerIds(a);
  const people = useUsersByIds(personIds);
  const nameOf = (userId: string) => people.data?.find((u) => u.id === userId)?.name ?? "…";
  const ready = personIds.length === 0 || !people.isPending;
  const printed = useRef(false);

  // Open the print dialog once, after names have loaded (the flag is set inside the timer so a
  // cancelled first effect run in development does not swallow it).
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      if (printed.current) return;
      printed.current = true;
      window.print();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ready]);

  const printedLine = `Printed on ${formatDate(todayLocal())} by ${user.name}`;
  const answers = answerRows(a, nameOf);
  const word = hazardWordTitle(a.domain);

  return (
    <>
      <style>{"@page { size: A4; margin: 14mm 12mm; }"}</style>
      <div data-print-hide className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" asChild className="-ml-2">
          <Link href={`/risk/assessments/${a.id}`}>
            <ArrowLeft /> Back to the assessment
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>

      <article className="mx-auto max-w-4xl rounded-xl border bg-card p-4 text-sm text-card-foreground shadow-sm sm:p-8 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:text-[10pt] print:text-black print:shadow-none">
        <div className="flex flex-col gap-4 border-b-2 border-brand pb-4 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground print:text-neutral-600">{user.organizationName}</p>
            <p className="mt-1 text-[11px] font-semibold tracking-wide text-brand uppercase">Risk assessment</p>
            <h1 className="mt-1 font-heading text-xl font-semibold break-words sm:text-2xl print:text-[16pt]">{a.title || "Untitled draft"}</h1>
            <p className="mt-1 text-muted-foreground print:text-neutral-600">
              {a.reference} · {statusLine(a)}
            </p>
          </div>
          <ScoreBox score={a.score} band={a.band} />
        </div>

        <Section title="Scope">
          <Rows rows={scopeRows(a, formatDate)} />
        </Section>

        <Section title={`${hazardsTitle(a.domain)} (${a.hazards.length}) · overall = highest score`}>
          {a.hazards.length === 0 ? (
            <p className="text-muted-foreground">No {hazardsTitle(a.domain).toLowerCase()} recorded yet.</p>
          ) : (
            <>
              {/* Phones: one card per hazard. */}
              <ol className="space-y-3 md:hidden print:hidden">
                {a.hazards.map((h, i) => (
                  <li key={h.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">
                        {i + 1}. {h.name || "Untitled"}
                        {h.activity && <span className="block text-xs font-normal text-muted-foreground">{h.activity}</span>}
                      </p>
                      <BandText score={h.score} band={h.band} />
                    </div>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      <MiniRow label="Rating" value={hazardRatingText(a, h)} />
                      <MiniRow label="Consequence" value={h.consequence} />
                      <MiniRow label="Current controls" value={h.controls} />
                      <MiniRow label="Recommendations" value={h.recommendation ?? ""} />
                      <MiniRow label="Why this score" value={h.justification} />
                    </dl>
                  </li>
                ))}
              </ol>
              {/* Tablet, desktop and paper: one table (its header repeats on every printed page). */}
              <div className="hidden overflow-x-auto md:block print:block print:overflow-visible">
                <table className="w-full border-collapse text-left text-xs print:text-[8.5pt]">
                  <thead>
                    <tr className="bg-muted/60 [print-color-adjust:exact] print:bg-neutral-100">
                      <Th className="w-6">#</Th>
                      <Th>{word} / activity</Th>
                      <Th>Consequence</Th>
                      <Th>Current controls</Th>
                      <Th>Recommendations</Th>
                      <Th className="w-32">Score</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.hazards.map((h, i) => (
                      <tr key={h.id} className="border-b align-top break-inside-avoid">
                        <Td className="text-muted-foreground">{i + 1}</Td>
                        <Td>
                          <span className="font-medium">{h.name || "Untitled"}</span>
                          {h.activity && <span className="block text-muted-foreground">{h.activity}</span>}
                        </Td>
                        <Td>{h.consequence}</Td>
                        <Td>{h.controls}</Td>
                        <Td>{h.recommendation || <span className="text-muted-foreground">—</span>}</Td>
                        <Td>
                          {hazardRatingText(a, h) && <span className="block text-muted-foreground">{hazardRatingText(a, h)}</span>}
                          <BandText score={h.score} band={h.band} />
                          {h.justification && <span className="mt-1 block text-[11px] text-muted-foreground">Why: {h.justification}</span>}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {a.rules.footnote && <p className="mt-3 text-xs text-muted-foreground">{a.rules.footnote}</p>}
        </Section>

        {answers.length > 0 && (
          <Section title={`Form questions · ${a.form.name} v${a.form.version}`}>
            <div className="space-y-2">
              {answers.map((row, i) =>
                row.kind === "heading" ? (
                  <h3 key={`h${i}`} className="pt-2 font-semibold">
                    {row.label}
                  </h3>
                ) : (
                  <Rows key={`a${i}`} rows={[{ label: row.label, value: row.value }]} />
                ),
              )}
            </div>
          </Section>
        )}

        <Section title="Approval and reviews">
          <Rows rows={approvalRows(a, formatDate)} />

          <h3 className="mt-4 mb-2 font-semibold">Score history</h3>
          {a.revisions.length === 0 ? (
            <p className="text-muted-foreground">Not approved yet – the first approval creates revision 1.</p>
          ) : (
            <ul className="divide-y rounded-lg border print:rounded-none">
              {a.revisions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 break-inside-avoid">
                  <span>
                    <span className="font-medium">Revision {r.revision}</span> · {REVISION_ACTION_LABELS[r.action]}
                    {r.taskReference ? ` · ${r.taskReference}` : ""}
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(r.date)} · {r.actorName ?? "—"}
                      {r.comment ? ` · ${r.comment}` : ""}
                    </span>
                  </span>
                  <BandText score={r.score} band={r.band} />
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-4 mb-2 font-semibold">Periodic reviews</h3>
          {a.reviews.length === 0 ? (
            <p className="text-muted-foreground">No periodic reviews yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border print:rounded-none">
              {a.reviews.map((r) => (
                <li key={r.id} className="px-3 py-2 break-inside-avoid">
                  <p className="font-medium">
                    Reviewed {formatDate(r.reviewDate)} · next review {formatDate(r.nextReviewDate)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.reviewerName ?? "—"} · revision {r.revision}
                    {r.score !== null ? ` · score ${r.score}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{r.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <p className="mt-6 border-t pt-3 text-xs text-muted-foreground print:text-neutral-600">
          {a.reference} · {printedLine}
        </p>
      </article>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 border-b pb-1 font-heading text-base font-semibold text-brand break-after-avoid print:text-[12pt]">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: PrintRow[] }) {
  return (
    <dl className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-0.5 break-inside-avoid sm:grid-cols-[11rem_1fr] sm:gap-4 print:grid-cols-[10rem_1fr] print:gap-4">
          <dt className="text-muted-foreground print:text-neutral-600">{row.label}</dt>
          <dd className={cn("break-words whitespace-pre-wrap", !row.value.trim() && "text-muted-foreground")}>{row.value.trim() || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words whitespace-pre-wrap">{value.trim() || "—"}</dd>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("border-b px-2 py-1.5 font-semibold", className)}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-2 py-2 break-words whitespace-pre-wrap", className)}>{children}</td>;
}

function BandText({ score, band }: { score: number | null; band: RiskBand | null }) {
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums [print-color-adjust:exact]", band ? BAND_CLASSES[band] : "bg-muted text-muted-foreground")}>
      {scoreText(score, band)}
    </span>
  );
}

function ScoreBox({ score, band }: { score: number | null; band: RiskBand | null }) {
  return (
    <div className={cn("shrink-0 rounded-xl px-4 py-3 [print-color-adjust:exact] sm:min-w-36", band ? BAND_CLASSES[band] : "bg-muted text-muted-foreground")}>
      <p className="text-xs font-normal opacity-80">Overall score</p>
      <p className="text-2xl font-semibold tabular-nums">{score ?? "Not scored"}</p>
      {band && <p className="text-xs font-semibold">{bandLabel(band)}</p>}
    </div>
  );
}
