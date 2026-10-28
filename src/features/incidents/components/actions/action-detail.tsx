"use client";

import { CheckCircle2, CircleCheck, CircleDashed, FileSearch, GitBranch, MoreHorizontal, Pencil, Play, Plus, RefreshCw, Save, ThumbsDown, ThumbsUp, Unlink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { CommentsPanel } from "@/components/common/comments-panel";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EvidencePanel } from "@/components/common/evidence-panel";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { LawConnectionsCard } from "@/features/law/components/law-connections-card";
import { UserPicker } from "@/components/common/user-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api-client";
import { ACTION_KIND_LABELS, PRIORITIES, PRIORITY_LABELS, type PriorityKey } from "@/lib/incidents";
import { PERMISSIONS } from "@/lib/permissions";
import { useAction, useActionCommand, useCompleteTask, useSaveTask, type ActionDetailDto, type FollowUpNode, type TaskDto } from "../../api";
import { addDaysLocal, blockersOf, formatDate, formatDateTime, todayLocal } from "../../format";
import { DepartmentSelect, enumOptions, SimpleSelect } from "../fields";
import { ActionStateBadge, BlockerList, Detail, IncidentStatusBadge, SectionHeading } from "../shared";
import { ActionFormSheet, type ActionSheetMode } from "./action-form-sheet";

export function ActionDetail({ id }: { id: string }) {
  const query = useAction(id);
  if (query.isPending) return <LoadingRows rows={6} className="[&>*:first-child]:h-20 [&>*]:h-24" />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Action not found" description="It does not exist or you do not have access to it." className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <ActionView action={query.data} />;
}

function ActionView({ action }: { action: ActionDetailDto }) {
  const [sheet, setSheet] = useState<ActionSheetMode | null>(null);
  const [dialog, setDialog] = useState<"complete" | "review" | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const cmd = useActionCommand(action.id);
  const p = action.permissions;
  const open = action.state === "OPEN" || action.state === "IN_PROGRESS";

  async function run(body: Parameters<typeof cmd.mutateAsync>[0], success: string) {
    setErrors([]);
    try {
      await cmd.mutateAsync(body);
      toast.success(success);
    } catch (error) {
      setErrors(blockersOf(error));
      toast.error(isStaleVersion(error) ? "Someone else changed this action – reload to see their changes." : errorMessage(error));
    }
  }

  let primary: React.ReactNode = null;
  if (open && p.work) {
    primary = (
      <Button onClick={() => setDialog("complete")}>
        <CheckCircle2 /> Complete action
      </Button>
    );
  } else if (action.state === "AWAITING_EFFECTIVENESS" && p.review) {
    primary = (
      <Button onClick={() => setDialog("review")}>
        <ThumbsUp /> Record effectiveness
      </Button>
    );
  } else if (action.state === "INEFFECTIVE" && p.followUp) {
    primary = (
      <Button onClick={() => setSheet({ mode: "follow-up", action })}>
        <GitBranch /> Add follow-up action
      </Button>
    );
  }

  return (
    <>
      <PageHeader
        title={action.description}
        backHref="/incidents/actions"
        backLabel="Actions"
        meta={
          <>
            <StatusBadge>{action.reference}</StatusBadge>
            <ActionStateBadge state={action.state} overdue={action.overdue} />
            <StatusBadge tone="brand">{ACTION_KIND_LABELS[action.kind]}</StatusBadge>
            <StatusBadge tone={action.priority === "HIGH" || action.priority === "URGENT" ? "warning" : "neutral"}>{PRIORITY_LABELS[action.priority]} priority</StatusBadge>
            {action.state === "INEFFECTIVE" && <StatusBadge tone={action.resolved ? "success" : "danger"}>{action.resolved ? "Resolved by follow-up" : "Follow-up needed"}</StatusBadge>}
          </>
        }
        actions={
          <>
            {primary}
            {(p.edit || (action.trend && p.edit) || (action.state === "OPEN" && p.work)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {action.state === "OPEN" && p.work && (
                    <DropdownMenuItem onSelect={() => void run({ command: "start", expectedVersion: action.version }, "Marked as in progress")}>
                      <Play /> Mark as in progress
                    </DropdownMenuItem>
                  )}
                  {p.edit && (
                    <DropdownMenuItem onSelect={() => setSheet({ mode: "edit", action })}>
                      <Pencil /> Edit plan
                    </DropdownMenuItem>
                  )}
                  {action.trend && p.edit && (
                    <DropdownMenuItem onSelect={() => void run({ command: "trend", expectedVersion: action.version }, "Trend snapshot refreshed")}>
                      <RefreshCw /> Refresh trend snapshot
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {open && <BlockerList className="mb-4" title="Before this action can be completed" blockers={action.completionBlockers} />}
      {action.state === "AWAITING_EFFECTIVENESS" && <BlockerList className="mb-4" title="Effectiveness cannot be recorded yet" blockers={action.reviewBlockers} />}
      <BlockerList className="mb-4" title="Not done" blockers={errors} tone="destructive" />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <TasksCard action={action} />
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <Detail label="Owner">{action.owner.name}</Detail>
                <Detail label="Due">{formatDate(action.dueDate)}</Detail>
                <Detail label="Where">{[action.placement.siteName, action.placement.departmentName].filter(Boolean).join(" · ") || null}</Detail>
                <Detail label="Category">{action.capaCategory}</Detail>
                <Detail label="Reviewer">{action.reviewer?.name}</Detail>
                <Detail label="Planned review">{formatDate(action.plannedReviewDate)}</Detail>
                <Detail label="Created">{`${formatDate(action.createdAt)}${action.createdBy ? ` by ${action.createdBy.name}` : ""}`}</Detail>
                {action.completedAt && <Detail label="What was done">{`${action.completionComment ?? ""}\n— ${action.completedBy?.name ?? ""}, ${formatDateTime(action.completedAt)}`}</Detail>}
                {action.reviewedAt && <Detail label="Effectiveness review">{`${action.reviewComment ?? ""}\n— ${action.reviewedBy?.name ?? ""}, ${formatDateTime(action.reviewedAt)}`}</Detail>}
              </dl>
            </CardContent>
          </Card>
          <EvidencePanel entityType="CorrectiveAction" entityId={action.id} />
          <CommentsPanel entityType="CorrectiveAction" entityId={action.id} />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Linked incidents</CardTitle>
              <CardDescription>{action.incidents.length > 1 ? "One shared action – its progress shows on each incident." : "The incident this action addresses."}</CardDescription>
            </CardHeader>
            <CardContent>
              {action.incidents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No incident – raised from its origin below.</p>
              ) : (
                <ul className="space-y-2">
                  {action.incidents.map((i) => (
                    <li key={i.id} className="flex items-center gap-2">
                      <Link href={`/incidents/${i.id}`} className="min-w-0 flex-1 text-sm hover:underline">
                        <span className="text-muted-foreground">{i.reference} · </span>
                        {i.title}
                      </Link>
                      <IncidentStatusBadge status={i.status} />
                      {p.edit && (action.incidents.length > 1 || action.kind === "PREVENTIVE" || action.source) && (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" className="size-8" aria-label={`Unlink ${i.reference}`}>
                              <Unlink />
                            </Button>
                          }
                          title={`Unlink ${i.reference}?`}
                          description="The action no longer counts for this incident."
                          confirmLabel="Unlink"
                          onConfirm={() => run({ command: "unlink", incidentId: i.id }, "Incident unlinked")}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {action.source && (
            <Card>
              <CardHeader>
                <CardTitle>Origin</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{action.source.href ? <Link href={action.source.href} className="text-brand hover:underline">{action.source.label}</Link> : action.source.label}</CardContent>
            </Card>
          )}
          <LawConnectionsCard entityType="CorrectiveAction" entityId={action.id} />
          {(action.parent || action.followUps.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Follow-ups</CardTitle>
                <CardDescription>An ineffective action is resolved only when every follow-up is effective.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {action.parent && (
                  <p>
                    Follow-up of{" "}
                    <Link href={`/incidents/actions/${action.parent.id}`} className="text-brand hover:underline">
                      {action.parent.reference}
                    </Link>{" "}
                    · {action.parent.description}
                  </p>
                )}
                {action.followUps.length > 0 && <FollowUpTree nodes={action.followUps} />}
              </CardContent>
            </Card>
          )}
          {action.trend && (
            <Card>
              <CardHeader>
                <CardTitle>Trend snapshot</CardTitle>
                <CardDescription>Captured {formatDateTime(action.trend.capturedAt)} – it only changes when refreshed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  {formatDate(action.trend.criteria.from)} – {formatDate(action.trend.criteria.to)}
                  {Object.values(action.trend.criteria.labels ?? {}).filter(Boolean).length ? ` · ${Object.values(action.trend.criteria.labels ?? {}).filter(Boolean).join(" · ")}` : ""}
                </p>
                <p className="text-muted-foreground">
                  {action.trend.matched.length} matching incident{action.trend.matched.length === 1 ? "" : "s"}: {action.trend.matched.map((m) => m.reference).join(", ") || "none"}
                </p>
                {p.edit && (
                  <Button variant="outline" size="sm" disabled={cmd.isPending} onClick={() => void run({ command: "trend", expectedVersion: action.version }, "Trend snapshot refreshed")}>
                    <RefreshCw /> Refresh snapshot
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {sheet && <ActionFormSheet open onOpenChange={(o) => !o && setSheet(null)} config={sheet} />}
      <CompleteDialog open={dialog === "complete"} onOpenChange={(o) => setDialog(o ? "complete" : null)} action={action} />
      <ReviewDialog open={dialog === "review"} onOpenChange={(o) => setDialog(o ? "review" : null)} action={action} />
    </>
  );
}

function FollowUpTree({ nodes }: { nodes: FollowUpNode[] }) {
  return (
    <ul className="space-y-1.5 border-l pl-3">
      {nodes.map((n) => (
        <li key={n.id}>
          <Link href={`/incidents/actions/${n.id}`} className="flex items-center gap-2 hover:underline">
            {n.resolved ? <CircleCheck className="size-4 text-success" /> : <CircleDashed className="size-4 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate">
              {n.reference} · {n.description}
            </span>
            <ActionStateBadge state={n.state} />
          </Link>
          {n.children.length > 0 && <div className="mt-1.5">{<FollowUpTree nodes={n.children} />}</div>}
        </li>
      ))}
    </ul>
  );
}

function TasksCard({ action }: { action: ActionDetailDto }) {
  const [editing, setEditing] = useState<TaskDto | "new" | null>(null);
  const [completing, setCompleting] = useState<TaskDto | null>(null);
  const done = action.tasks.filter((t) => t.done).length;
  return (
    <Card>
      <CardHeader>
        <SectionHeading
          title="Tasks"
          description={action.tasks.length ? `${done} of ${action.tasks.length} done. Every task must be done before the action can be completed.` : "Split the work into tasks if several people are involved."}
          actions={
            action.permissions.addTask ? (
              <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
                <Plus /> Add task
              </Button>
            ) : undefined
          }
        />
      </CardHeader>
      <CardContent>
        {action.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {action.tasks.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                <span className="mt-0.5">{t.done ? <CircleCheck className="size-5 text-success" /> : <CircleDashed className="size-5 text-muted-foreground" />}</span>
                <div className="min-w-0 flex-1">
                  <p className={t.done ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.owner.name} · due {formatDate(t.dueDate)} · {PRIORITY_LABELS[t.priority]}
                    {t.departmentName ? ` · ${t.departmentName}` : ""}
                    {t.overdue && <span className="font-medium text-destructive"> · overdue</span>}
                  </p>
                  {t.done && t.completionComment && (
                    <p className="mt-1 text-xs">
                      {t.completionComment} <span className="text-muted-foreground">— {t.completedBy?.name}, {formatDate(t.completedAt)}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  {t.canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                      <Pencil /> Edit
                    </Button>
                  )}
                  {t.canComplete && (
                    <Button size="sm" variant="outline" onClick={() => setCompleting(t)}>
                      <CheckCircle2 /> Done
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {action.tasks.length > 0 && (
          <div className="mt-3">
            <EvidenceForTasks tasks={action.tasks} />
          </div>
        )}
      </CardContent>
      {editing && <TaskDialog action={action} task={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {completing && <CompleteTaskDialog action={action} task={completing} onClose={() => setCompleting(null)} />}
    </Card>
  );
}

function EvidenceForTasks({ tasks }: { tasks: TaskDto[] }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <SimpleSelect value={taskId} onChange={setTaskId} options={tasks.map((t) => ({ value: t.id, label: t.title }))} placeholder="Show evidence for a task…" allowNone noneLabel="Hide task evidence" className="sm:w-80" />
      {taskId && <EvidencePanel entityType="ActionTask" entityId={taskId} title="Task evidence" />}
    </div>
  );
}

function TaskDialog({ action, task, onClose }: { action: ActionDetailDto; task: TaskDto | null; onClose: () => void }) {
  const save = useSaveTask(action.id);
  const [v, setV] = useState({
    title: task?.title ?? "",
    ownerId: task?.owner.id ?? null,
    departmentId: task?.departmentId ?? null,
    dueDate: task?.dueDate ?? (action.dueDate > todayLocal() ? action.dueDate : addDaysLocal(todayLocal(), 7)),
    priority: (task?.priority ?? "NORMAL") as PriorityKey,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "Add a task"}</DialogTitle>
          <DialogDescription>Completing a task does not complete the action.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="t-title">Task *</FieldLabel>
            <Input id="t-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Order replacement" />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-owner">Owner *</FieldLabel>
            <UserPicker id="t-owner" value={v.ownerId} onChange={(id) => setV({ ...v, ownerId: id })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="t-due">Due date *</FieldLabel>
              <Input id="t-due" type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="t-priority">Priority</FieldLabel>
              <SimpleSelect id="t-priority" value={v.priority} onChange={(x) => setV({ ...v, priority: (x ?? "NORMAL") as PriorityKey })} options={enumOptions(PRIORITIES, PRIORITY_LABELS)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="t-dept">Department</FieldLabel>
            <DepartmentSelect id="t-dept" value={v.departmentId} onChange={(x) => setV({ ...v, departmentId: x })} allowNone noneLabel="Same as the action" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending || !v.title.trim() || !v.ownerId || !v.dueDate}
            onClick={async () => {
              try {
                await save.mutateAsync({ taskId: task?.id, title: v.title, ownerId: v.ownerId!, departmentId: v.departmentId, dueDate: v.dueDate, priority: v.priority });
                toast.success(task ? "Task updated" : "Task added");
                onClose();
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            {save.isPending ? <Spinner /> : <Save />} Save task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteTaskDialog({ action, task, onClose }: { action: ActionDetailDto; task: TaskDto; onClose: () => void }) {
  const complete = useCompleteTask();
  const [comment, setComment] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete “{task.title}”</DialogTitle>
          <DialogDescription>The action stays open until it is completed on its own.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="tc-comment">What was done? *</FieldLabel>
          <Textarea id="tc-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={complete.isPending || !comment.trim()}
            onClick={async () => {
              try {
                await complete.mutateAsync({ actionId: action.id, taskId: task.id, completionComment: comment });
                toast.success("Task done");
                onClose();
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            {complete.isPending ? <Spinner /> : <CheckCircle2 />} Mark done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({ open, onOpenChange, action }: { open: boolean; onOpenChange: (o: boolean) => void; action: ActionDetailDto }) {
  const cmd = useActionCommand(action.id);
  const [comment, setComment] = useState("");
  const [reviewerId, setReviewerId] = useState<string | null>(action.reviewer?.id ?? null);
  const [reviewDate, setReviewDate] = useState(action.plannedReviewDate ?? addDaysLocal(todayLocal(), 30));
  const [blockers, setBlockers] = useState<string[]>([]);
  const openTasks = action.tasks.filter((t) => !t.done);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete {action.reference}</DialogTitle>
          <DialogDescription>The action then waits for its effectiveness review – it is not yet Effective.</DialogDescription>
        </DialogHeader>
        {openTasks.length > 0 && <BlockerList title="Open tasks" blockers={openTasks.map((t) => `“${t.title}” (${t.owner.name}) is not done yet.`)} />}
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="c-comment">What was done? *</FieldLabel>
            <Textarea id="c-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Replacement inspected and issued" />
          </Field>
          <Field>
            <FieldLabel htmlFor="c-reviewer">Effectiveness reviewer *</FieldLabel>
            <UserPicker id="c-reviewer" value={reviewerId} onChange={setReviewerId} permission={PERMISSIONS.INCIDENT_ACTION_VERIFY} />
          </Field>
          <Field>
            <FieldLabel htmlFor="c-date">Review on or after *</FieldLabel>
            <Input id="c-date" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
            <FieldDescription>Effectiveness can only be recorded on or after this date.</FieldDescription>
          </Field>
          <BlockerList title="Not completed" blockers={blockers} tone="destructive" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={cmd.isPending || openTasks.length > 0 || !comment.trim() || !reviewerId || !reviewDate}
            onClick={async () => {
              setBlockers([]);
              try {
                await cmd.mutateAsync({ command: "complete", expectedVersion: action.version, completionComment: comment, reviewerId, plannedReviewDate: reviewDate });
                toast.success(`${action.reference} completed – awaiting effectiveness review`);
                onOpenChange(false);
              } catch (error) {
                setBlockers(blockersOf(error));
                toast.error(errorMessage(error));
              }
            }}
          >
            {cmd.isPending ? <Spinner /> : <CheckCircle2 />} Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({ open, onOpenChange, action }: { open: boolean; onOpenChange: (o: boolean) => void; action: ActionDetailDto }) {
  const cmd = useActionCommand(action.id);
  const [comment, setComment] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const tooEarly = action.reviewBlockers.length > 0;
  const submit = async (outcome: "EFFECTIVE" | "INEFFECTIVE") => {
    setBlockers([]);
    try {
      await cmd.mutateAsync({ command: "review", expectedVersion: action.version, outcome, comment });
      toast.success(outcome === "EFFECTIVE" ? "Recorded as effective" : "Recorded as ineffective – add a follow-up action");
      onOpenChange(false);
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(errorMessage(error));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Was {action.reference} effective?</DialogTitle>
          <DialogDescription>Check that the change works in practice. An ineffective action needs a follow-up action.</DialogDescription>
        </DialogHeader>
        <BlockerList title="Not yet" blockers={action.reviewBlockers} />
        <p className="text-sm">
          <span className="text-muted-foreground">What was done: </span>
          {action.completionComment}
        </p>
        <Field>
          <FieldLabel htmlFor="r-comment">Review comment *</FieldLabel>
          <Textarea id="r-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Checked in use; control is effective" />
        </Field>
        <BlockerList title="Not recorded" blockers={blockers} tone="destructive" />
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={cmd.isPending || tooEarly || !comment.trim()} onClick={() => void submit("INEFFECTIVE")}>
            <ThumbsDown /> Not effective
          </Button>
          <Button disabled={cmd.isPending || tooEarly || !comment.trim()} onClick={() => void submit("EFFECTIVE")}>
            {cmd.isPending ? <Spinner /> : <ThumbsUp />} Effective
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
