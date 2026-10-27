"use client";

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FileDropzone } from "@/components/common/file-dropzone";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api-client";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "@/lib/validation/configuration";
import { cn } from "@/lib/utils";
import { useApplyImport, useReviewImport, type ImportResult, type ImportReview } from "../api";
import { ConfigHeader } from "./shared";

const TYPE_LABELS: Record<string, [string, string]> = {
  business_unit: ["Business unit", "Business units"],
  site: ["Site", "Sites"],
  location: ["Location", "Locations"],
  department: ["Department", "Departments"],
  role: ["Role", "Roles"],
  user: ["User", "Users"],
  category: ["Category", "Categories"],
  template: ["Template", "Templates"],
};

const COLUMNS: [string, string][] = [
  ["type", "business_unit, site, location, department, role, user, category or template"],
  ["key", "Your own unique id for the row, e.g. galway-hub"],
  ["name", "The name to create"],
  ["parent_key", "Site → business unit, location → site, department → location, user → role: a key from this file (rows may come in any order) or the name of one existing item"],
  ["email", "User rows only – work email"],
  ["permissions", "Role rows only – permission keys separated by semicolons, e.g. risk.view;incident.view"],
  ["notes", "Optional"],
];

/** /configuration/import – CSV template, review with per-line errors, all-or-nothing apply. */
export function ImportPage() {
  const review = useReviewImport();
  const apply = useApplyImport();
  const [files, setFiles] = useState<File[]>([]);
  const [content, setContent] = useState<string | null>(null);
  const [result, setResult] = useState<ImportReview | null>(null);
  const [applied, setApplied] = useState<ImportResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const file = files[0];

  function reset() {
    setFiles([]);
    setContent(null);
    setResult(null);
    setApplied(null);
    setFileError(null);
  }

  async function choose(next: File[]) {
    reset();
    setFiles(next);
    const chosen = next[0];
    if (!chosen) return;
    if (!/\.csv$/i.test(chosen.name) && chosen.type && !/csv|text\/plain|excel/.test(chosen.type)) {
      setFileError("Choose a .csv file (save spreadsheets as CSV first).");
      return;
    }
    try {
      const text = await chosen.text();
      setContent(text);
      setResult(await review.mutateAsync({ content: text, fileName: chosen.name }));
    } catch (error) {
      setFileError(errorMessage(error));
    }
  }

  async function confirm() {
    if (!content) return;
    try {
      const res = await apply.mutateAsync({ content, fileName: file?.name });
      setApplied(res);
      toast.success(`Imported ${res.total} row${res.total === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(errorMessage(error));
      // Re-review: something may have changed since the first review.
      try {
        setResult(await review.mutateAsync({ content, fileName: file?.name }));
      } catch {}
    }
  }

  const issuesByLine = new Map<number, string[]>();
  for (const issue of result?.issues ?? []) issuesByLine.set(issue.line, [...(issuesByLine.get(issue.line) ?? []), issue.message]);
  const fileIssues = issuesByLine.get(0) ?? [];

  return (
    <>
      <ConfigHeader title="Bulk import" description="Load company structure, roles, directory users, categories and templates from one CSV file. Nothing is applied until you confirm." />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">1. Download the template</CardTitle>
            <CardDescription>Fill one row per item. Up to {IMPORT_MAX_ROWS} rows and {IMPORT_MAX_BYTES / 1024 / 1024} MB per file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild variant="outline">
              <a href="/api/configuration/import/template" download>
                <Download /> Download CSV template
              </a>
            </Button>
            <dl className="space-y-1.5 text-sm">
              {COLUMNS.map(([name, text]) => (
                <div key={name} className="grid grid-cols-[6.5rem_1fr] gap-2">
                  <dt className="font-mono text-xs leading-5 text-brand">{name}</dt>
                  <dd className="text-muted-foreground">{text}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Imported users are directory entries without a sign-in, and their role is only a directory reference. Give them access in{" "}
              <Link className="underline" href="/configuration/roles?view=assignments">
                Roles &amp; permissions
              </Link>
              . No invitations are sent.
            </p>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">2. Upload and review</CardTitle>
            <CardDescription>Every row is checked first. If any row has a problem, nothing is imported.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FileDropzone files={files} onChange={(next) => void choose(next)} maxBytes={IMPORT_MAX_BYTES} accept=".csv,text/csv" disabled={review.isPending || apply.isPending} hint="CSV file · up to 2 MB" />
            {review.isPending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Checking the file…
              </p>
            )}
            {fileError && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertDescription>{fileError}</AlertDescription>
              </Alert>
            )}
            {(file || result) && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw /> Choose another file
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {applied && (
        <Alert className="mt-4 border-success/40 bg-success/5">
          <CheckCircle2 className="text-success" />
          <AlertTitle>Import complete – {applied.total} rows created</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 flex flex-wrap gap-2">
              {Object.entries(applied.created)
                .filter(([, n]) => n > 0)
                .map(([type, n]) => (
                  <li key={type}>
                    <StatusBadge tone="success">
                      {n} {TYPE_LABELS[type]?.[n === 1 ? 0 : 1].toLowerCase() ?? type}
                    </StatusBadge>
                  </li>
                ))}
            </ul>
            {applied.created.user > 0 && <p className="mt-2">Imported people cannot sign in yet and have no access. Add their roles in Roles &amp; permissions.</p>}
          </AlertDescription>
        </Alert>
      )}

      {result && !applied && (
        <section className="mt-6 space-y-3" aria-label="Review">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">3. Review {file ? `“${file.name}”` : ""}</h2>
              {Object.entries(result.counts)
                .filter(([, n]) => n > 0)
                .map(([type, n]) => (
                  <StatusBadge key={type} tone="brand">
                    {n} {TYPE_LABELS[type]?.[n === 1 ? 0 : 1].toLowerCase() ?? type}
                  </StatusBadge>
                ))}
            </div>
            <Button disabled={!result.valid || apply.isPending} onClick={() => setConfirming(true)}>
              {apply.isPending ? <Spinner /> : <Upload />} Import {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
            </Button>
          </div>

          {result.issues.length > 0 ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>
                {result.issues.length} problem{result.issues.length === 1 ? "" : "s"} found – nothing will be imported
              </AlertTitle>
              <AlertDescription>
                <p>Correct the file and upload it again.</p>
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                  {result.issues.map((issue, i) => (
                    <li key={i}>
                      <span className="font-medium">{issue.line ? `Line ${issue.line}` : "File"}:</span> {issue.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-success/40 bg-success/5">
              <CheckCircle2 className="text-success" />
              <AlertTitle>Everything checks out</AlertTitle>
              <AlertDescription>Rows are created in order: business units, sites, locations, departments, roles, users, categories, templates.</AlertDescription>
            </Alert>
          )}

          {result.rows.length > 0 && fileIssues.length === 0 && (
            <Card className="gap-0 overflow-hidden py-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-4">Line</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Parent</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="pr-4">Check</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row) => {
                      const problems = issuesByLine.get(row.line);
                      return (
                        <TableRow key={row.line} className={cn(problems && "bg-destructive/5")}>
                          <TableCell className="pl-4 tabular-nums text-muted-foreground">{row.line}</TableCell>
                          <TableCell>{TYPE_LABELS[row.type]?.[0] ?? row.type}</TableCell>
                          <TableCell className="max-w-56">
                            <span className="block truncate font-medium">{row.name}</span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">{row.key}</span>
                          </TableCell>
                          <TableCell className="max-w-56 truncate text-muted-foreground">{row.parentLabel ?? (row.parentKey || "—")}</TableCell>
                          <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                            {row.type === "user" ? row.email : row.type === "role" ? `${row.permissions.length} permission${row.permissions.length === 1 ? "" : "s"}` : row.notes || "—"}
                          </TableCell>
                          <TableCell className="pr-4">
                            {problems ? <StatusBadge tone="danger">{problems.length} problem{problems.length === 1 ? "" : "s"}</StatusBadge> : <StatusBadge tone="success">OK</StatusBadge>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
          {!result.rows.length && fileIssues.length === 0 && result.issues.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <FileSpreadsheet className="mr-1 inline size-4" /> No row could be read.
            </p>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Import ${result?.rows.length ?? 0} rows?`}
        description="Everything in the file is created in one step. If anything fails, nothing is created."
        confirmLabel="Import"
        onConfirm={confirm}
      />
    </>
  );
}
