"use client";

import { Archive, ArchiveRestore, CalendarCheck, CheckCircle2, Copy, FilePenLine, FileSearch, MoreHorizontal, Pencil, QrCode, Send } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CommentsPanel } from "@/components/common/comments-panel";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EvidencePanel } from "@/components/common/evidence-panel";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api-client";
import { addMonths, hazardWordTitle } from "@/lib/risk/labels";
import { RISK_METHOD_LABELS } from "@/lib/risk/scoring";
import { reviewBlockers } from "@/server/modules/risk/workflow";
import { useAssessment, useAssessmentCommand, type AssessmentDetailDto } from "../../api";
import { blockersOf, formatDate } from "../../format";
import { AssessmentStatusBadge, BlockerList, ConfidentialBadge, LifecycleStepper, ScoreChip } from "../shared";
import { TaskFormSheet } from "../tasks/task-form-sheet";
import { HistoryTab, OverviewTab, ScorecardTab, TasksTab } from "./assessment-tabs";
import { QrLabelDialog } from "./qr-label-dialog";

const TABS = ["overview", "scorecard", "tasks", "history", "evidence", "comments"] as const;
type Tab = (typeof TABS)[number];

/** Assessment detail: ONE primary next step, lifecycle stepper and tabs (Overview first, History & reviews later). */
export function AssessmentDetail({ id }: { id: string }) {
  const query = useAssessment(id);
  if (query.isPending) return <LoadingRows rows={6} className="[&>*:first-child]:h-20 [&>*]:h-24" />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Assessment not found" description="It does not exist or you do not have access to it." className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <Detail a={query.data} />;
}

function Detail({ a }: { a: AssessmentDetailDto }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "overview";
  const setTab = (t: string) => router.replace(`${pathname}${t === "overview" ? "" : `?tab=${t}`}`, { scroll: false });
  const reviewRequested = params.get("review") === "1";
  const [dialog, setDialog] = useState<"review" | "approve" | "qr" | "archive" | "task" | null>(reviewRequested && a.permissions.review ? "review" : null);
  const [taskHazard, setTaskHazard] = useState<string | undefined>();
  const [errorBlockers, setErrorBlockers] = useState<string[]>([]);
  const command = useAssessmentCommand(a.id);
  const p = a.permissions;

  async function run(cmd: "submit" | "revise" | "archive" | "restore" | "clone", success: string) {
    setErrorBlockers([]);
    try {
      const result = cmd === "clone" ? await command.mutateAsync({ command: "clone" }) : await command.mutateAsync({ command: cmd, expectedVersion: a.version });
      toast.success(success);
      if (cmd === "clone" && result) router.push(`/risk/assessments/${result.id}`);
      if (cmd === "revise") router.push(`/risk/assessments/${a.id}/edit`);
    } catch (error) {
      setErrorBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? "Someone else changed this assessment – reload to see their changes." : errorMessage(error));
    }
  }

  const primary = (() => {
    switch (a.nextStep) {
      case "SUBMIT":
        return a.submitBlockers.length ? (
          <Button asChild>
            <Link href={`/risk/assessments/${a.id}/edit`}>
              <Send /> Complete and submit
            </Link>
          </Button>
        ) : (
          <Button onClick={() => void run("submit", `${a.reference} submitted for approval`)} disabled={command.isPending}>
            <Send /> Submit for approval
          </Button>
        );
      case "APPROVE":
        return (
          <Button onClick={() => setDialog("approve")}>
            <CheckCircle2 /> Approve
          </Button>
        );
      case "RECORD_REVIEW":
        return (
          <Button onClick={() => setDialog("review")}>
            <CalendarCheck /> Record periodic review
          </Button>
        );
      case "START_REVISION":
        return (
          <Button onClick={() => void run("revise", "Draft revision started")} disabled={command.isPending}>
            <FilePenLine /> Start revision
          </Button>
        );
      case "RESTORE":
        return (
          <Button onClick={() => void run("restore", `${a.reference} restored as draft`)} disabled={command.isPending}>
            <ArchiveRestore /> Restore as draft
          </Button>
        );
      default:
        return null;
    }
  })();

  const more = [
    p.edit ? (
      <DropdownMenuItem key="edit" asChild>
        <Link href={`/risk/assessments/${a.id}/edit`}>
          <Pencil /> Edit assessment
        </Link>
      </DropdownMenuItem>
    ) : null,
    p.revise && a.nextStep !== "START_REVISION" ? (
      <DropdownMenuItem key="revise" onSelect={() => void run("revise", "Draft revision started")}>
        <FilePenLine /> Start revision
      </DropdownMenuItem>
    ) : null,
    p.approve && a.nextStep !== "APPROVE" ? (
      <DropdownMenuItem key="approve" onSelect={() => setDialog("approve")}>
        <CheckCircle2 /> Approve
      </DropdownMenuItem>
    ) : null,
    <DropdownMenuItem key="qr" onSelect={() => setDialog("qr")}>
      <QrCode /> QR label
    </DropdownMenuItem>,
    p.clone ? (
      <DropdownMenuItem key="clone" onSelect={() => void run("clone", "Clone created as a new draft")}>
        <Copy /> Clone as new draft
      </DropdownMenuItem>
    ) : null,
    p.archive ? <DropdownMenuSeparator key="sep" /> : null,
    p.archive ? (
      <DropdownMenuItem key="archive" onSelect={() => setDialog("archive")}>
        <Archive /> Archive
      </DropdownMenuItem>
    ) : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={a.title || "Untitled draft"}
        backHref="/risk/assessments"
        backLabel="Risk assessments"
        meta={
          <>
            <StatusBadge tone="neutral">{a.reference}</StatusBadge>
            <AssessmentStatusBadge status={a.status} />
            <ScoreChip score={a.score} band={a.band} method={a.method} />
            <StatusBadge tone="brand">{RISK_METHOD_LABELS[a.method]}</StatusBadge>
            {a.revision > 0 && <StatusBadge tone="neutral">Revision {a.revision}</StatusBadge>}
            {a.isConfidential && <ConfidentialBadge />}
          </>
        }
        actions={
          <>
            {primary}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label="More actions">
                  <MoreHorizontal /> <span className="sm:hidden">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">{more}</DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {a.status !== "ARCHIVED" && <LifecycleStepper stages={a.lifecycle} />}
      {a.status === "ARCHIVED" && (
        <Alert className="mb-4 border-warning/40 bg-warning/5">
          <AlertDescription>Archived {formatDate(a.archivedAt)}. Restoring returns it to Draft; it is not approved again automatically.</AlertDescription>
        </Alert>
      )}
      {reviewRequested && a.status !== "APPROVED" && (
        <Alert className="mb-4">
          <AlertDescription>Periodic review is only available for Approved assessments – this one is {a.status === "ARCHIVED" ? "archived" : "not approved yet"}.</AlertDescription>
        </Alert>
      )}
      {a.status === "APPROVED" && a.reviewOverdue && (
        <Alert className="mb-4 border-destructive/40 bg-destructive/5">
          <AlertDescription>The periodic review was due {formatDate(a.reviewDate)}.</AlertDescription>
        </Alert>
      )}
      {(a.status === "DRAFT" || a.status === "AWAITING_APPROVAL") && <BlockerList className="mb-4" title={a.status === "DRAFT" ? "Before it can be submitted" : "Before it can be approved"} blockers={a.submitBlockers} />}
      <BlockerList className="mb-4" title="Not done" blockers={errorBlockers} tone="destructive" />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
          <TabsList className="h-9">
            <TabsTrigger value="overview" className="px-3">Overview</TabsTrigger>
            <TabsTrigger value="scorecard" className="px-3">Scorecard</TabsTrigger>
            <TabsTrigger value="tasks" className="px-3">Tasks{a.tasks.length ? ` (${a.tasks.length})` : ""}</TabsTrigger>
            <TabsTrigger value="history" className="px-3">History & reviews</TabsTrigger>
            <TabsTrigger value="evidence" className="px-3">Evidence</TabsTrigger>
            <TabsTrigger value="comments" className="px-3">Comments</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview">
          <OverviewTab a={a} />
        </TabsContent>
        <TabsContent value="scorecard">
          <ScorecardTab a={a} />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksTab
            a={a}
            onAdd={(hazardId) => {
              setTaskHazard(hazardId);
              setDialog("task");
            }}
          />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab a={a} />
        </TabsContent>
        <TabsContent value="evidence">
          <EvidencePanel entityType="RiskAssessment" entityId={a.id} readOnly={!p.addEvidence} />
        </TabsContent>
        <TabsContent value="comments">
          <CommentsPanel entityType="RiskAssessment" entityId={a.id} />
        </TabsContent>
      </Tabs>

      {dialog === "review" && <ReviewDialog a={a} onClose={() => setDialog(null)} />}
      {dialog === "approve" && <ApproveDialog a={a} onClose={() => setDialog(null)} />}
      {dialog === "qr" && <QrLabelDialog open onOpenChange={(o) => !o && setDialog(null)} assessment={a} />}
      <ConfirmDialog
        open={dialog === "archive"}
        onOpenChange={(o) => setDialog(o ? "archive" : null)}
        title={`Archive ${a.reference}?`}
        description="It leaves the registers and reminders but nothing is deleted. Restoring brings it back as a Draft."
        confirmLabel="Archive"
        destructive
        onConfirm={() => run("archive", "Assessment archived")}
      />
      {dialog === "task" && (
        <TaskFormSheet open onOpenChange={(o) => !o && setDialog(null)} config={{ mode: "create", kind: "RA", assessmentId: a.id, hazardId: taskHazard }} onSaved={() => setTab("tasks")} />
      )}
    </>
  );
}

function ReviewDialog({ a, onClose }: { a: AssessmentDetailDto; onClose: () => void }) {
  const [reviewDate, setReviewDate] = useState(a.today);
  const [nextReviewDate, setNext] = useState(addMonths(a.today, a.rules.reviewMonths));
  const [comment, setComment] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const command = useAssessmentCommand(a.id);
  const local = reviewBlockers({ status: a.status, reviewDate: reviewDate || null, nextReviewDate: nextReviewDate || null, comment: comment || " ", today: a.today }).filter((b) => !/comment/.test(b));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Periodic review · {a.reference}</DialogTitle>
          <DialogDescription>
            Confirm the assessment is still valid. The score ({a.score ?? "—"}) and revision ({a.revision}) do not change; only the next review date moves.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
            {a.title} · {hazardWordTitle(a.domain, true).toLowerCase()}: {a.hazards.map((h) => h.name).join(", ") || "—"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="r-date">Review date *</FieldLabel>
              <Input id="r-date" type="date" max={a.today} value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
              <FieldDescription>Today or earlier.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="r-next">Next review date *</FieldLabel>
              <Input id="r-next" type="date" min={reviewDate} value={nextReviewDate} onChange={(e) => setNext(e.target.value)} />
              <FieldDescription>Not before the review date.</FieldDescription>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="r-comment">Review comment *</FieldLabel>
            <Textarea id="r-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Controls checked; assessment remains valid" />
          </Field>
          <BlockerList title="Check the dates" blockers={local} />
          <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={command.isPending || !comment.trim() || local.length > 0}
            onClick={async () => {
              setBlockers([]);
              try {
                await command.mutateAsync({ command: "review", reviewDate, nextReviewDate, comment, expectedVersion: a.version });
                toast.success(`Review recorded – next review ${formatDate(nextReviewDate)}`);
                onClose();
              } catch (error) {
                setBlockers(blockersOf(error));
                toast.error(errorMessage(error));
              }
            }}
          >
            {command.isPending ? <Spinner /> : <CalendarCheck />} Save review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ a, onClose }: { a: AssessmentDetailDto; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const command = useAssessmentCommand(a.id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {a.reference}</DialogTitle>
          <DialogDescription>
            Approval creates revision {a.revision + 1} and keeps a snapshot of the score and {hazardWordTitle(a.domain, true).toLowerCase()}. The responsible person stays {a.owner?.name ?? "unchanged"}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-xl border p-3">
          <span className="text-sm">Overall score</span>
          <ScoreChip score={a.score} band={a.band} method={a.method} />
        </div>
        <BlockerList title="Still missing" blockers={a.submitBlockers} />
        <Field>
          <FieldLabel htmlFor="ap-comment">Comment</FieldLabel>
          <Textarea id="ap-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional" />
        </Field>
        <BlockerList title="Not approved" blockers={blockers} tone="destructive" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={command.isPending || a.submitBlockers.length > 0}
            onClick={async () => {
              setBlockers([]);
              try {
                await command.mutateAsync({ command: "approve", expectedVersion: a.version, comment: comment || null });
                toast.success(`${a.reference} approved`);
                onClose();
              } catch (error) {
                setBlockers(blockersOf(error));
                toast.error(errorMessage(error));
              }
            }}
          >
            {command.isPending ? <Spinner /> : <CheckCircle2 />} Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
