"use client";

import { AlertTriangle, CheckCircle2, Download, Gauge, ListChecks, Printer, Scale } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageBanner } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterSelect } from "@/features/documents/components/filters";
import { ALL_REGISTERS, LAW_CATEGORIES } from "@/lib/law";
import { LAW_REPORT_KEYS, type LawReportKey } from "@/lib/validation/law";
import { useLawProfiles, useLawReport, type LawReportDto } from "../../api";
import { formatDate } from "../../format";
import { LawDisclaimer, ProfileSelect, useProfileParam } from "../shared";

const REPORT_LABELS: Record<LawReportKey, string> = {
  register: "Compliance register",
  tasks: "Task tracking",
  links: "Linked risk & incident work",
};

const REPORT_HINTS: Record<LawReportKey, string> = {
  register: "Every requirement of the profile: whether it applies, who checked it and when it is next reviewed.",
  tasks: "Tasks raised from requirements – who does what, by when, and what is done.",
  links: "Risk assessments, incidents and incident actions linked to or raised from a requirement.",
};

const EMPTY_TEXT: Record<LawReportKey, { title: string; description: string }> = {
  register: { title: "No requirements to show", description: "Nothing in this profile matches the register and category you chose." },
  tasks: { title: "No tasks yet", description: "Tasks raised from requirements appear here." },
  links: { title: "No linked records yet", description: "Link a risk assessment, or raise an incident or action from a requirement, and it appears here." },
};

/** Rating column name in the register report – present only when the profile shows its rating. */
const RATING_COLUMN = "Self-assessed rating %";

function isReportKey(value: string | null): value is LawReportKey {
  return value !== null && (LAW_REPORT_KEYS as readonly string[]).includes(value);
}

/** Law reports: compliance register, task tracking, linked risk & incident work. CSV download and print. */
export function LawReports() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const keyParam = params.get("report");
  const key: LawReportKey = isReportKey(keyParam) ? keyParam : "register";
  const [profileParam, setProfileParam] = useProfileParam();
  const profiles = useLawProfiles();
  const [register, setRegister] = useState<string | undefined>();
  const [category, setCategory] = useState<string | undefined>();

  const profileList = profiles.data ?? [];
  // The select shows the first profile when nothing valid is chosen; the server does the same.
  const profileId = profileParam && profileList.some((p) => p.id === profileParam) ? profileParam : (profileList[0]?.id ?? null);
  const report = useLawReport(key, { profileId, register, category });

  const changeReport = (next: string) => {
    const query = new URLSearchParams(params.toString());
    if (next === "register") query.delete("report");
    else query.set("report", next);
    router.replace(`${pathname}${query.size ? `?${query.toString()}` : ""}`, { scroll: false });
  };
  const csv = new URLSearchParams({ format: "csv" });
  if (profileId) csv.set("profileId", profileId);
  if (register) csv.set("register", register);
  if (category) csv.set("category", category);
  const hasProfile = Boolean(report.data?.profile);

  return (
    <>
      <div data-print-hide>
        <PageBanner
          title="Law reports"
          description="Share a clear view of your compliance register, the work still to do and the linked risk and incident records."
          actions={
            hasProfile ? (
              <>
                <Button asChild variant="secondary">
                  <a href={`/api/law/reports/${key}?${csv.toString()}`} download>
                    <Download /> Download CSV
                  </a>
                </Button>
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer /> Print
                </Button>
              </>
            ) : undefined
          }
        />

        <Tabs value={key} onValueChange={changeReport} className="mb-3">
          <TabsList className="h-auto flex-wrap">
            {LAW_REPORT_KEYS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {REPORT_LABELS[k]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card className="mb-4 gap-0 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.5fr)_1fr_1fr]">
            {profileList.length > 0 ? (
              <ProfileSelect value={profileId} onChange={setProfileParam} profiles={profileList.map((p) => ({ id: p.id, name: p.name, siteName: p.site?.name }))} className="sm:w-full" />
            ) : (
              <p className="flex h-9 items-center text-sm text-muted-foreground">No legal profile yet</p>
            )}
            <FilterSelect value={register} onChange={setRegister} options={ALL_REGISTERS.map((r) => ({ id: r, name: r }))} allLabel="All registers" ariaLabel="Register" />
            <FilterSelect value={category} onChange={setCategory} options={LAW_CATEGORIES.map((c) => ({ id: c, name: c }))} allLabel="All categories" ariaLabel="Category" />
          </div>
        </Card>
      </div>

      {profiles.isPending || report.isPending ? (
        <LoadingRows rows={6} />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : !report.data.profile ? (
        <EmptyState
          icon={Scale}
          title="No legal profile yet"
          description="Reports are made for a legal profile – the set of requirements that apply to a site or the company. Create one first."
          action={
            <Button asChild>
              <Link href="/law/profiles">Go to profiles</Link>
            </Button>
          }
        />
      ) : (
        <ReportView report={report.data} reportKey={key} register={register} category={category} />
      )}
    </>
  );
}

function ReportView({ report, reportKey, register, category }: { report: LawReportDto; reportKey: LawReportKey; register?: string; category?: string }) {
  const s = report.summary;
  const showsRating = report.columns.includes(RATING_COLUMN);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{report.title}</h2>
        <p className="text-sm text-muted-foreground">
          {report.profile!.name} · content version {report.profile!.contentVersion} · {register ?? "All registers"} · {category ?? "All categories"}
        </p>
        <p className="text-xs text-muted-foreground" data-print-hide>
          {REPORT_HINTS[reportKey]}
        </p>
      </div>

      {reportKey === "register" && s && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Apply to us" value={s.total} hint={s.excluded ? `${s.excluded} marked as not applying` : "Requirements in this profile"} icon={ListChecks} />
          <StatCard label="Checked" value={`${s.complete} of ${s.total}`} hint="Check fully written down" icon={CheckCircle2} tone="success" />
          <StatCard label="Need attention" value={s.review} hint="Law changed or review date passed" icon={AlertTriangle} tone={s.review ? "warning" : "success"} />
          {showsRating ? (
            <StatCard label="Self-assessed compliance" value={s.score === null ? "Not assessed" : `${s.score}%`} hint={`rated ${s.rated} of ${s.total}`} icon={Gauge} tone="info" />
          ) : (
            <StatCard label="Self-assessed compliance" value="Not shown" hint="This profile hides its rating" icon={Gauge} tone="info" />
          )}
        </div>
      )}

      {report.rows.length === 0 ? (
        <EmptyState icon={Scale} title={EMPTY_TEXT[reportKey].title} description={EMPTY_TEXT[reportKey].description} />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {report.columns.map((c) => (
                    <TableHead key={c} className="first:pl-4 last:pr-4">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j} className="max-w-72 whitespace-normal align-top first:pl-4 last:pr-4">
                        <Cell column={report.columns[j] ?? ""} value={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            {report.rows.length} row{report.rows.length === 1 ? "" : "s"}
          </p>
        </Card>
      )}
      <LawDisclaimer />
    </div>
  );
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Plain cell: dates as "12 Mar 2026", attention and overdue flags as badges so they stand out on screen and paper. */
function Cell({ column, value }: { column: string; value: string | number | null }) {
  if (value === null || value === "") return <span className="text-muted-foreground">—</span>;
  if (column === "Needs attention") return <StatusBadge tone="warning">{value}</StatusBadge>;
  if (column === "Overdue" && value === "Yes") return <StatusBadge tone="danger">Overdue</StatusBadge>;
  if (typeof value === "string" && DATE_ONLY.test(value)) return <span className="whitespace-nowrap">{formatDate(value)}</span>;
  return <>{value}</>;
}
