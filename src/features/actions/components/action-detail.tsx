"use client";

import { Ban, CheckCircle2, Circle, CircleDot, FileSearch, History, MoreHorizontal, Pencil, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CommentsPanel } from "@/components/common/comments-panel";
import { EvidencePanel } from "@/components/common/evidence-panel";
import { PaginationBar } from "@/components/common/pagination-bar";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuestionnaireAnswers } from "@/features/forms/components/questionnaire-answers";
import { useLookups, useUsersByIds } from "@/features/shared/lookups";
import { ACTION_PRIORITY_LABELS } from "@/lib/actions";
import { ApiError, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAction, useActionHistory, useReopenAction, useStartAction, type ActionDetailDto, type LifecycleStep } from "../api";
import { ACTION_HISTORY_LABELS, describeChanges, formatDate, formatDateTime } from "../format";
import { ActionPriorityBadge, ActionStatusBadge } from "./action-badges";
import { CancelActionDialog, CompleteActionDialog } from "./action-dialogs";
import { EditActionSheet } from "./action-form";

export function ActionDetail({ id }: { id: string }) {
  const query = useAction(id);
  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Action not found" description="It does not exist or you do not have access to it." className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <Detail action={query.data} />;
}

function Detail({ action: a }: { action: ActionDetailDto }) {
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const start = useStartAction(a.id);
  const reopen = useReopenAction(a.id);
  const p = a.permissions;

  async function run(mutation: typeof start, done: string) {
    try {
      await mutation.mutateAsync(a.version);
      toast.success(done);
    } catch (error) {
      toast.error(isStaleVersion(error) ? "Someone else changed this action – reload to see their changes." : errorMessage(error));
    }
  }

  const primary =
    a.nextStep === "start" ? (
      <Button onClick={() => void run(start, `${a.reference} started`)} disabled={start.isPending}>
        <Play /> Start work
      </Button>
    ) : a.nextStep === "complete" ? (
      <Button onClick={() => setCompleting(true)}>
        <CheckCircle2 /> Complete action
      </Button>
    ) : a.nextStep === "reopen" ? (
      <Button variant="outline" onClick={() => void run(reopen, `${a.reference} reopened`)} disabled={reopen.isPending}>
        <RotateCcw /> Reopen
      </Button>
    ) : null;
  const more = [
    a.status === "OPEN" && p.work ? { key: "complete", icon: CheckCircle2, label: "Mark as done", onSelect: () => setCompleting(true) } : null,
    p.edit ? { key: "edit", icon: Pencil, label: "Edit action", onSelect: () => setEditing(true) } : null,
    p.cancel ? { key: "cancel", icon: Ban, label: "Cancel action", onSelect: () => setCancelling(true) } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <>
      <PageHeader
        title={a.title}
        backHref="/actions"
        backLabel="My Actions"
        meta={
          <>
            <StatusBadge tone="neutral">{a.reference}</StatusBadge>
            <ActionStatusBadge status={a.status} overdue={a.overdue} />
            <ActionPriorityBadge priority={a.priority} />
          </>
        }
        actions={
          <>
            {primary}
            {more.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label="More actions">
                    <MoreHorizontal /> <span className="sm:hidden">More</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {more.map((m) => (
                    <DropdownMenuItem key={m.key} onSelect={m.onSelect}>
                      <m.icon /> {m.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <Stepper steps={a.lifecycle} />

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="px-3">Overview</TabsTrigger>
          <TabsTrigger value="evidence" className="px-3">Evidence</TabsTrigger>
          <TabsTrigger value="comments" className="px-3">Comments</TabsTrigger>
          <TabsTrigger value="history" className="px-3">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>What needs to be done</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  <Item label="Details">{a.description ? <span className="whitespace-pre-wrap">{a.description}</span> : null}</Item>
                  <Item label="Who does it">{a.assignedToMe ? `${a.owner.name} (me)` : a.owner.name}</Item>
                  <Item label="Due">
                    <span className={a.overdue ? "font-medium text-destructive" : undefined}>
                      {formatDate(a.dueDate)}
                      {a.overdue ? " · overdue" : ""}
                    </span>
                  </Item>
                  <Item label="Priority">{ACTION_PRIORITY_LABELS[a.priority]}</Item>
                  <Item label="Where">{a.placeLabel ?? "Whole company"}</Item>
                  <Item label="Asked by">
                    {a.createdBy.name} · {formatDate(a.createdOn)}
                  </Item>
                </dl>
              </CardContent>
            </Card>
            {a.form && a.form.fields.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>More details</CardTitle>
                  <CardDescription>
                    {a.form.name} · version {a.form.version}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <QuestionnaireAnswers snapshot={a.form} answers={a.answers} />
                </CardContent>
              </Card>
            )}
          </div>
          <div className="space-y-4">
            {a.status === "COMPLETED" && (
              <Card className="border-success/40">
                <CardHeader>
                  <CardTitle>Completed</CardTitle>
                  <CardDescription>
                    {a.completedOn ? formatDate(a.completedOn) : ""}
                    {a.completedByName ? ` by ${a.completedByName}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm">{a.completionNotes}</CardContent>
              </Card>
            )}
            {a.status === "CANCELLED" && (
              <Card>
                <CardHeader>
                  <CardTitle>Cancelled</CardTitle>
                  <CardDescription>
                    {a.cancelledAt ? formatDate(a.cancelledAt) : ""}
                    {a.cancelledByName ? ` by ${a.cancelledByName}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm">{a.cancelReason}</CardContent>
              </Card>
            )}
            {(a.status === "OPEN" || a.status === "IN_PROGRESS") && (
              <Card>
                <CardHeader>
                  <CardTitle>Next step</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{nextStepText(a)}</CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        <TabsContent value="evidence">
          <EvidencePanel entityType="Action" entityId={a.id} readOnly={!p.evidence} />
        </TabsContent>
        <TabsContent value="comments">
          <CommentsPanel entityType="Action" entityId={a.id} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab action={a} />
        </TabsContent>
      </Tabs>

      {editing && <EditActionSheet open action={a} onOpenChange={(o) => !o && setEditing(false)} />}
      {completing && <CompleteActionDialog open action={a} onOpenChange={(o) => !o && setCompleting(false)} />}
      {cancelling && <CancelActionDialog open action={a} onOpenChange={(o) => !o && setCancelling(false)} />}
    </>
  );
}

function nextStepText(a: ActionDetailDto): string {
  if (a.permissions.work) {
    return a.status === "OPEN" ? "Press Start work when you begin, or mark it as done straight away." : "When it is done, press Complete action and say what was done.";
  }
  return `${a.owner.name} ${a.status === "OPEN" ? "has not started yet" : "is working on it"}. You will be told when it is completed.`;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const STEP_ICON = { done: CheckCircle2, current: CircleDot, todo: Circle } as const;

/** To do → In progress → Completed (or Cancelled). */
function Stepper({ steps }: { steps: LifecycleStep[] }) {
  return (
    <ol className="mb-5 flex gap-1 overflow-x-auto rounded-xl border bg-card p-2" aria-label="Progress">
      {steps.map((s) => {
        const Icon = STEP_ICON[s.state];
        return (
          <li
            key={s.key}
            className={cn(
              "flex min-w-fit flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm",
              s.state === "current" && "bg-brand-soft font-semibold text-brand",
              s.state === "done" && (s.key === "CANCELLED" ? "text-muted-foreground" : "text-success"),
              s.state === "todo" && "text-muted-foreground",
            )}
            aria-current={s.state === "current" ? "step" : undefined}
          >
            <Icon className="size-4 shrink-0" />
            <span>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function HistoryTab({ action }: { action: ActionDetailDto }) {
  const [page, setPage] = useState(1);
  const history = useActionHistory(action.id, page);
  const lookups = useLookups();
  const personIds = [
    ...new Set(
      (history.data?.items ?? []).flatMap((e) => {
        const owner = (e.changes as { ownerId?: unknown } | null)?.ownerId;
        if (typeof owner === "string") return [owner];
        if (owner && typeof owner === "object") return [(owner as { from?: unknown }).from, (owner as { to?: unknown }).to].filter((x): x is string => typeof x === "string");
        return [];
      }),
    ),
  ];
  const people = useUsersByIds(personIds);
  const names = (id: string) => people.data?.find((u) => u.id === id)?.name ?? lookups.data?.departments.find((d) => d.id === id)?.name ?? null;

  if (history.isPending) return <LoadingRows rows={5} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (!history.data.items.length) return <EmptyState icon={History} title="No history yet" />;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>History</CardTitle>
        <CardDescription>Signed audit trail – changes never remove earlier entries.</CardDescription>
      </CardHeader>
      <ul className="divide-y">
        {history.data.items.map((e) => {
          const meta = (e.metadata ?? {}) as { notes?: unknown; reason?: unknown; form?: unknown };
          return (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{ACTION_HISTORY_LABELS[e.action] ?? e.action.replace(/_/g, " ").toLowerCase()}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(e.createdAt)} · {e.actorName ?? "System"}
                </p>
              </div>
              {describeChanges(e.action === "ACTION_CREATED" ? null : e.changes, names).map((line) => (
                <p key={line} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
              {typeof meta.notes === "string" && <p className="text-xs text-muted-foreground">“{meta.notes}”</p>}
              {typeof meta.reason === "string" && <p className="text-xs text-muted-foreground">Reason: {meta.reason}</p>}
              {typeof meta.form === "string" && <p className="text-xs text-muted-foreground">Extra questions: {meta.form}</p>}
            </li>
          );
        })}
      </ul>
      <div className="border-t px-3">
        <PaginationBar page={page} pageSize={history.data.pageSize} total={history.data.total} onPageChange={setPage} />
      </div>
    </Card>
  );
}
