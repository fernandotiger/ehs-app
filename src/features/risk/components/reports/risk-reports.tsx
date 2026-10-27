"use client";

import { Download, LineChart, Printer } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SiteSelect } from "@/features/incidents/components/fields";
import { RISK_REPORT_KEYS, RISK_REPORT_LABELS, type RiskReportKey } from "@/lib/validation/risk";
import { toQueryString, useRiskReport } from "../../api";
import { formatDate } from "../../format";
import { BarList, BlockerList } from "../shared";

const SHORT: Record<RiskReportKey, string> = {
  "by-department": "1 · By department",
  "by-hazard": "2 · By hazard / aspect",
  "score-reductions": "3 · Score reductions",
  "review-coverage": "4 · Review coverage",
  "outstanding-strategy": "5 · Outstanding objectives",
  "outstanding-tasks": "6 · Outstanding tasks",
  "task-summary": "7 · Task summary",
};

/** Risk reports 1–7: site + optional period, CSV export and print / save as PDF. */
export function RiskReportsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const keyParam = params.get("report") as RiskReportKey | null;
  const key: RiskReportKey = keyParam && (RISK_REPORT_KEYS as readonly string[]).includes(keyParam) ? keyParam : "by-department";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const valid = !from || !to || from <= to;
  const report = useRiskReport(key, { from: from || undefined, to: to || undefined, siteId: siteId ?? undefined }, valid);

  return (
    <>
      <PageHeader title="Risk reports" description="Choose a report, a site and – if you like – a period. Download as CSV or print / save as PDF." />
      <Card className="mb-4 gap-0 p-3" data-print-hide>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.4fr)_auto_auto_minmax(12rem,1fr)_auto] lg:items-end">
          <Field>
            <FieldLabel htmlFor="rr-key">Report</FieldLabel>
            <select
              id="rr-key"
              className="h-9 rounded-md border bg-card px-2 text-sm"
              value={key}
              onChange={(e) => router.replace(`${pathname}?report=${e.target.value}`, { scroll: false })}
            >
              {RISK_REPORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SHORT[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="rr-from">From</FieldLabel>
            <Input id="rr-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rr-to">To</FieldLabel>
            <Input id="rr-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rr-site">Site</FieldLabel>
            <SiteSelect id="rr-site" value={siteId} onChange={setSiteId} allowNone noneLabel="All sites" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`/api/risk/reports/${key}?${toQueryString({ from, to, siteId, format: "csv" })}`}>
                <Download /> CSV
              </a>
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </div>
        </div>
      </Card>
      {!valid ? (
        <BlockerList title="Choose a valid period" blockers={["The period end must be on or after its start."]} />
      ) : report.isPending ? (
        <LoadingRows rows={5} />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">{report.data.title}</h2>
            <p className="text-sm text-muted-foreground">
              {report.data.period.from || report.data.period.to ? `${report.data.period.from ? formatDate(report.data.period.from) : "Any time"} – ${report.data.period.to ? formatDate(report.data.period.to) : "today"}` : "All dates"} · {report.data.period.siteName ?? "All sites"}
            </p>
            <p className="text-xs text-muted-foreground">Date filter: {report.data.dateMeaning}</p>
          </div>
          {report.data.chart.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <BarList items={report.data.chart} />
              </CardContent>
            </Card>
          )}
          {report.data.rows.length === 0 ? (
            <EmptyState icon={LineChart} title="No matching records" description="Nothing matches this site and period – try a longer period or another site." />
          ) : (
            <Card className="gap-0 overflow-hidden py-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      {report.data.columns.map((c) => (
                        <TableHead key={c} className="first:pl-4 last:pr-4">
                          {c}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.data.rows.map((row, i) => (
                      <TableRow key={i} className={row[0] === "Total" ? "font-semibold" : undefined}>
                        {row.map((cell, j) => (
                          <TableCell key={j} className="max-w-72 whitespace-normal first:pl-4 last:pr-4">
                            {cell ?? ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
          {report.data.notes.map((n) => (
            <p key={n} className="text-xs text-muted-foreground">
              {n}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">{RISK_REPORT_LABELS[key]} · {report.data.rows.length} row{report.data.rows.length === 1 ? "" : "s"}</p>
        </div>
      )}
    </>
  );
}
