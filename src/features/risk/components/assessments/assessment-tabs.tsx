"use client";

import { ChevronDown, History, Link2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { LinkedRecords } from "@/components/common/linked-records";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuestionnaireAnswers } from "@/features/forms/components/questionnaire-answers";
import { errorMessage } from "@/lib/api-client";
import { CHECKLIST_RESULT_LABELS, hazardWordTitle, REVISION_ACTION_LABELS } from "@/lib/risk/labels";
import { FMEA_FACTORS, RISK_DOMAIN_LABELS, RISK_METHOD_LABELS, reviewFrequencyLabel, type RiskDomain } from "@/lib/risk/scoring";
import { classify } from "@/server/modules/risk/scoring";
import { useAssessmentCommand, useAssessmentHistory, useAssessments, useUnlinkRelated, type AssessmentDetailDto, type HazardSnapshot } from "../../api";
import { formatDate, formatDateTime, placementLabel, RISK_HISTORY_LABELS } from "../../format";
import { AssessmentStatusBadge, Detail, ScoreChip, SectionHeading } from "../shared";
import { TaskList } from "../tasks/task-list";
import { HeatMap } from "./heat-map";

const SYSTEM_KEYS = ["riskTitle", "hazard", "site", "likelihood", "severity", "riskScore", "owner", "reviewDate"];

// ── Overview ────────────────────────────────────────────────────────────────

export function OverviewTab({ a }: { a: AssessmentDetailDto }) {
  const word = hazardWordTitle(a.domain, true);
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Scope</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Detail label="Activity description">{a.description}</Detail>
              <Detail label="Where">{placementLabel(a.placement)}</Detail>
              <Detail label="Responsible person">{a.owner?.name}</Detail>
              <Detail label="Approver">{a.approver?.name}</Detail>
              <Detail label="Participants">{a.participants.map((p) => p.name).join(", ") || null}</Detail>
              <Detail label="Activity / item">{[a.itemType, a.itemIdentity].filter(Boolean).join(" · ") || null}</Detail>
              <Detail label="Operation mode">{a.operationMode}</Detail>
              <Detail label="Work area">{a.workArea}</Detail>
              {a.domain === "ENVIRONMENT" ? <Detail label="Impact context">{a.impactContext}</Detail> : <Detail label="People exposed">{a.peopleExposed}</Detail>}
              <Detail label="Review date">
                <span className={a.reviewOverdue ? "font-medium text-destructive" : a.reviewDue ? "font-medium text-warning" : undefined}>
                  {formatDate(a.reviewDate)}
                  {a.reviewOverdue ? " · overdue" : a.reviewDue ? " · due soon" : ""}
                </span>
              </Detail>
              <Detail label="Risk form">
                {a.form.name} v{a.form.version} · {RISK_METHOD_LABELS[a.method]} · {RISK_DOMAIN_LABELS[a.domain as RiskDomain] ?? a.domain}
                <span className="block text-xs text-muted-foreground">
                  Captured {formatDate(a.form.capturedAt)} · {reviewFrequencyLabel(a.rules.reviewMonths).toLowerCase()} · reminders {a.rules.advanceNoticeDays} days ahead
                  {a.rules.thresholds ? ` · Medium ${a.rules.thresholds.medium} / High ${a.rules.thresholds.high} / Critical ${a.rules.thresholds.critical}` : ""}
                </span>
              </Detail>
              <Detail label="Revision">{a.revision ? `${a.revision}${a.approvedAt ? ` · approved ${formatDate(a.approvedAt)}${a.approvedByName ? ` by ${a.approvedByName}` : ""}` : ""}` : "Not approved yet"}</Detail>
              {a.lastReviewedAt && <Detail label="Last periodic review">{formatDate(a.lastReviewedAt)}</Detail>}
              {a.clonedFrom && (
                <Detail label="Cloned from">
                  <Link href={`/risk/assessments/${a.clonedFrom.id}`} className="text-brand hover:underline">
                    {a.clonedFrom.reference}
                  </Link>
                </Detail>
              )}
            </dl>
          </CardContent>
        </Card>
        <RelatedCard a={a} />
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{a.method === "5x5" || a.method === "3x3" ? "Heat-map" : a.method === "FMEA" ? "Priority numbers" : "Checklist results"}</CardTitle>
            <CardDescription>
              {a.hazards.length} {word.toLowerCase()} · overall = highest score
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HeatMap rules={a.rules} hazards={a.hazards} />
          </CardContent>
        </Card>
        {a.rules.footnote && <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{a.rules.footnote}</p>}
        <LinkedRecords entityType="RiskAssessment" entityId={a.id} />
      </div>
    </div>
  );
}

function RelatedCard({ a }: { a: AssessmentDetailDto }) {
  const [open, setOpen] = useState(false);
  const unlink = useUnlinkRelated(a.id);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Related assessments</CardTitle>
          <CardDescription>Other assessments at the same site.</CardDescription>
        </div>
        {a.permissions.link && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Link2 /> Relate
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {a.related.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="-mx-2 divide-y">
            {a.related.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-2 py-2">
                <Link href={`/risk/assessments/${r.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  <span className="text-muted-foreground">{r.reference} · </span>
                  {r.title}
                </Link>
                <ScoreChip score={r.score} band={r.band} />
                {a.permissions.link && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    aria-label={`Remove ${r.reference}`}
                    onClick={async () => {
                      try {
                        await unlink.mutateAsync(r.id);
                        toast.success("Relation removed");
                      } catch (error) {
                        toast.error(errorMessage(error));
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {open && <RelateDialog a={a} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function RelateDialog({ a, onClose }: { a: AssessmentDetailDto; onClose: () => void }) {
  const [q, setQ] = useState("");
  const list = useAssessments({ page: 1, pageSize: 20, relatedTo: a.id, q: q || undefined, status: "ACTIVE" });
  const link = useAssessmentCommand(a.id);
  const linked = new Set(a.related.map((r) => r.id));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Relate an assessment</DialogTitle>
          <DialogDescription>Only assessments at {a.placement.siteName ?? "the same site"} can be related.</DialogDescription>
        </DialogHeader>
        <input className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" placeholder="Search reference or title" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search assessments" />
        {list.isPending ? (
          <LoadingRows rows={3} />
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {(list.data?.items ?? []).filter((x) => !linked.has(x.id)).map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-muted/50"
                  onClick={async () => {
                    try {
                      await link.mutateAsync({ command: "related", otherId: x.id });
                      toast.success(`${x.reference} related`);
                      onClose();
                    } catch (error) {
                      toast.error(errorMessage(error));
                    }
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted-foreground">{x.reference} · </span>
                    {x.title}
                  </span>
                  <AssessmentStatusBadge status={x.status} />
                </button>
              </li>
            ))}
            {list.data && list.data.items.filter((x) => !linked.has(x.id)).length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">No other assessments at this site.</li>}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Scorecard ───────────────────────────────────────────────────────────────

function methodValues(a: Pick<AssessmentDetailDto, "method" | "domain">, h: HazardSnapshot): string {
  if (a.method === "CHECKLIST") return h.checklistResult ? CHECKLIST_RESULT_LABELS[h.checklistResult] : "—";
  if (a.method === "FMEA") {
    const factors = FMEA_FACTORS[a.domain === "ENVIRONMENT" ? "ENVIRONMENT" : "HEALTH_SAFETY"];
    const avg = (g: string) => {
      const list = factors.filter((f) => f.group === g).map((f) => h.factors?.[f.key]).filter((v): v is number => v !== undefined);
      return list.length ? (list.reduce((s, v) => s + v, 0) / list.length).toFixed(1) : "—";
    };
    return `S ${avg("severity")} × L ${avg("likelihood")} × D ${avg("detection")}`;
  }
  return h.likelihood && h.severity ? `L ${h.likelihood} × S ${h.severity}` : "—";
}

export function ScorecardTab({ a }: { a: AssessmentDetailDto }) {
  const word = hazardWordTitle(a.domain);
  const customFields = a.form.fields.filter((f) => !SYSTEM_KEYS.includes(f.key));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <p className="text-sm text-muted-foreground">Overall score · highest {word.toLowerCase()} score</p>
          <p className="text-sm">
            {RISK_METHOD_LABELS[a.method]} · revision {a.revision}
          </p>
        </div>
        <ScoreChip score={a.score} band={a.band} method={a.method} size="lg" />
      </div>
      {a.hazards.length === 0 ? (
        <EmptyState title={`No ${word.toLowerCase()}s yet`} description="Edit the assessment to add them." />
      ) : (
        <div className="space-y-3">
          {a.hazards.map((h, i) => (
            <Card key={h.id} className="gap-0 py-0">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <CardTitle className="text-base">
                  {i + 1}. {h.name || "Untitled"} <span className="font-normal text-muted-foreground">· {h.activity || "—"}</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{methodValues(a, h)}</span>
                  <ScoreChip score={h.score} band={h.band} method={a.method} />
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <dl className="grid gap-3 md:grid-cols-2">
                  <Detail label="Consequence" className="md:grid-cols-1">{h.consequence}</Detail>
                  <Detail label="Current controls" className="md:grid-cols-1">{h.controls}</Detail>
                  <Detail label="Scoring justification" className="md:grid-cols-1">{h.justification}</Detail>
                  <Detail label="Recommendations" className="md:grid-cols-1">{h.recommendation}</Detail>
                </dl>
                {h.openTasks > 0 && <StatusBadge tone="brand" className="mt-3">{h.openTasks} open task{h.openTasks === 1 ? "" : "s"}</StatusBadge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {customFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Form questions</CardTitle>
            <CardDescription>
              Answers to {a.form.name} v{a.form.version}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuestionnaireAnswers snapshot={{ fields: a.form.fields, siteId: a.form.siteId }} answers={a.answers} hideKeys={SYSTEM_KEYS} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export function TasksTab({ a, onAdd }: { a: AssessmentDetailDto; onAdd: (hazardId?: string) => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>Improvement tasks</CardTitle>
          <CardDescription>RA tasks on the {hazardWordTitle(a.domain, true).toLowerCase()} of this assessment – a completed scoring task rescores the Approved assessment.</CardDescription>
        </div>
        {a.permissions.createTask && (
          <Button size="sm" onClick={() => onAdd()}>
            <Plus /> Add task
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <TaskList tasks={a.tasks} empty="No tasks on this assessment yet." />
      </CardContent>
    </Card>
  );
}

// ── History & reviews ───────────────────────────────────────────────────────

export function HistoryTab({ a }: { a: AssessmentDetailDto }) {
  return (
    <div className="space-y-4">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Score history</CardTitle>
          <CardDescription>Retained snapshots of every approval and task-driven rescore (scores and {hazardWordTitle(a.domain, true).toLowerCase()} with their controls).</CardDescription>
        </CardHeader>
        {a.revisions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Not approved yet – the first approval creates revision 1.</p>
        ) : (
          <ul className="divide-y">
            {a.revisions.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <Collapsible>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        Revision {r.revision} · {REVISION_ACTION_LABELS[r.action]}
                        {r.taskReference && r.taskId ? (
                          <>
                            {" "}·{" "}
                            <Link href={`/risk/tasks/${r.taskId}`} className="text-brand hover:underline">
                              {r.taskReference}
                            </Link>
                          </>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(r.date)} · {r.actorName ?? "—"}
                        {r.comment ? ` · ${r.comment}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ScoreChip score={r.score} band={r.band} method={a.method} />
                      <CollapsibleTrigger asChild>
                        <Button size="sm" variant="ghost">
                          Snapshot <ChevronDown />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  <CollapsibleContent className="pt-2">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{hazardWordTitle(a.domain)}</TableHead>
                            <TableHead>Controls</TableHead>
                            <TableHead>Values</TableHead>
                            <TableHead>Score</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {r.hazards.map((h) => (
                            <TableRow key={h.id}>
                              <TableCell className="max-w-48 whitespace-normal">{h.name}</TableCell>
                              <TableCell className="max-w-72 whitespace-normal text-muted-foreground">{h.controls}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs">{methodValues(a, h)}</TableCell>
                              <TableCell>
                                <ScoreChip score={h.score} band={classify(h.score, a.rules)} method={a.method} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Periodic reviews</CardTitle>
          <CardDescription>A review confirms the assessment is still valid and moves the review date – it never changes the score or the revision.</CardDescription>
        </CardHeader>
        {a.reviews.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No periodic reviews yet.</p>
        ) : (
          <ul className="divide-y">
            {a.reviews.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <p className="text-sm font-medium">
                  Reviewed {formatDate(r.reviewDate)} · next review {formatDate(r.nextReviewDate)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.reviewerName ?? "—"} · revision {r.revision}
                  {r.score !== null ? ` · score ${r.score}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{r.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <AuditTrail id={a.id} />
    </div>
  );
}

function describeChanges(changes: unknown): string[] {
  if (!changes || typeof changes !== "object") return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
    if (value && typeof value === "object" && "to" in (value as object)) {
      const v = value as { from: unknown; to: unknown };
      const show = (x: unknown) => (x === null || x === undefined || x === "" ? "—" : Array.isArray(x) ? `${x.length} item(s)` : typeof x === "object" ? "updated" : String(x));
      out.push(`${key}: ${show(v.from)} → ${show(v.to)}`);
    } else if ((typeof value === "string" && value.length < 200) || typeof value === "number") out.push(`${key}: ${value}`);
  }
  return out.slice(0, 6);
}

function AuditTrail({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const history = useAssessmentHistory(id, page);
  if (history.isPending) return <LoadingRows rows={4} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (!history.data.items.length) return <EmptyState icon={History} title="No history yet" />;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <SectionHeading title="Audit trail" description="Signed record of every change – nothing is removed." />
      </CardHeader>
      <ul className="divide-y">
        {history.data.items.map((e) => (
          <li key={e.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{RISK_HISTORY_LABELS[e.action] ?? e.action.replace(/_/g, " ").toLowerCase()}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(e.createdAt)} · {e.actorName ?? "System"}
              </p>
            </div>
            {describeChanges(e.changes).map((line) => (
              <p key={line} className="text-xs text-muted-foreground">
                {line}
              </p>
            ))}
          </li>
        ))}
      </ul>
      <div className="border-t px-3">
        <PaginationBar page={page} pageSize={history.data.pageSize} total={history.data.total} onPageChange={setPage} />
      </div>
    </Card>
  );
}
