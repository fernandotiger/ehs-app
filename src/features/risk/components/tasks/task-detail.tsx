"use client";

import { CheckCircle2, FileSearch, MoreHorizontal, Pencil, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { CommentsPanel } from "@/components/common/comments-panel";
import { EvidencePanel } from "@/components/common/evidence-panel";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, errorMessage } from "@/lib/api-client";
import { TASK_KIND_LABELS, TASK_STATUS_LABELS } from "@/lib/risk/labels";
import { completionBlockers } from "@/server/modules/risk/workflow";
import { useRiskTask, useStartTask, type TaskDetailDto } from "../../api";
import { formatDate } from "../../format";
import { BlockerList, Detail, ProgressBar, TaskStatusBadge } from "../shared";
import { CompleteTaskDialog } from "./complete-task-dialog";
import { TaskFormSheet, type TaskSheetConfig } from "./task-form-sheet";
import { TaskList } from "./task-list";

export function TaskDetail({ id }: { id: string }) {
  const query = useRiskTask(id);
  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Task not found" description="It does not exist or you do not have access to it." className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <Detail_ task={query.data} />;
}

function Detail_({ task }: { task: TaskDetailDto }) {
  const [sheet, setSheet] = useState<TaskSheetConfig | null>(null);
  const [completing, setCompleting] = useState(false);
  const start = useStartTask(task.id);
  const p = task.permissions;
  const blockers =
    task.status === "COMPLETED"
      ? []
      : completionBlockers({
          status: task.status,
          openSubTasks: task.openSubTasks,
          comment: "x",
          completedOn: task.today,
          createdOn: task.createdOn,
          today: task.today,
          scoring: task.scoring,
          assessmentStatus: task.assessmentStatus,
          actualValue: task.scoring ? (task.factorRange?.min ?? 0) : null,
          factorRange: null,
        });

  async function startTask() {
    try {
      await start.mutateAsync(task.version);
      toast.success(`${task.reference} started`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const primary =
    task.status === "COMPLETED" || !p.work ? null : task.status === "OPEN" ? (
      <Button onClick={() => void startTask()} disabled={start.isPending}>
        <Play /> Start work
      </Button>
    ) : (
      <Button onClick={() => setCompleting(true)}>
        <CheckCircle2 /> Complete task
      </Button>
    );

  return (
    <>
      <PageHeader
        title={task.title}
        backHref="/risk/tasks"
        backLabel="Risk tasks"
        meta={
          <>
            <StatusBadge tone="neutral">{task.reference}</StatusBadge>
            <TaskStatusBadge status={task.status} overdue={task.overdue} />
            <StatusBadge tone="brand">{TASK_KIND_LABELS[task.kind]}</StatusBadge>
            {task.scoring && <StatusBadge tone="purple">Changes the score</StatusBadge>}
          </>
        }
        actions={
          <>
            {primary}
            {task.status === "OPEN" && p.work && (
              <Button variant="outline" onClick={() => setCompleting(true)}>
                <CheckCircle2 /> Complete
              </Button>
            )}
            {(p.edit || p.addSubTask) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label="More actions">
                    <MoreHorizontal /> <span className="sm:hidden">More</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {p.edit && (
                    <DropdownMenuItem onSelect={() => setSheet({ mode: "edit", task })}>
                      <Pencil /> Edit task
                    </DropdownMenuItem>
                  )}
                  {p.addSubTask && (
                    <DropdownMenuItem onSelect={() => setSheet({ mode: "create", parent: task })}>
                      <Plus /> Add sub-task
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      {task.status !== "COMPLETED" && p.work && <BlockerList className="mb-4" title="Before this task can be completed" blockers={blockers} />}

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="px-3">Overview</TabsTrigger>
          <TabsTrigger value="subtasks" className="px-3">Sub-tasks{task.subTaskCount ? ` (${task.subTaskCount})` : ""}</TabsTrigger>
          <TabsTrigger value="evidence" className="px-3">Evidence</TabsTrigger>
          <TabsTrigger value="comments" className="px-3">Comments</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Task</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <Detail label="Additional information">{task.info}</Detail>
                <Detail label="Responsible person">{task.owner.name}</Detail>
                <Detail label="Created">{formatDate(task.createdOn)}</Detail>
                <Detail label="Due">
                  <span className={task.overdue ? "font-medium text-destructive" : undefined}>
                    {formatDate(task.dueDate)}
                    {task.overdue ? " · overdue" : ""}
                  </span>
                </Detail>
                <Detail label="Management programme">
                  <Link className="text-brand hover:underline" href={`/risk/strategy/programmes/${task.programme.id}`}>
                    {task.programme.title}
                  </Link>
                </Detail>
                {task.assessment && (
                  <Detail label="Assessment">
                    {task.assessment.id ? (
                      <Link className="text-brand hover:underline" href={`/risk/assessments/${task.assessment.id}`}>
                        {task.assessment.reference} · {task.assessment.title}
                      </Link>
                    ) : (
                      `${task.assessment.reference} · ${task.assessment.title}`
                    )}
                    {task.hazard ? <span className="block text-muted-foreground">Hazard / aspect: {task.hazard.name}</span> : null}
                  </Detail>
                )}
                {task.factor && (
                  <Detail label="Scoring factor">
                    {task.factorLabel}: {task.originalValue ?? "—"} now → {task.targetValue ?? "—"} intended{task.actualValue !== null ? ` · ${task.actualValue} achieved` : ""}
                  </Detail>
                )}
                {task.status === "COMPLETED" && (
                  <>
                    <Detail label="Completed">
                      {formatDate(task.completedOn)}
                      {task.completedByName ? ` by ${task.completedByName}` : ""}
                    </Detail>
                    <Detail label="Completion comment">{task.completionComment}</Detail>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
          <div className="space-y-4">
            {task.parent && (
              <Card>
                <CardHeader>
                  <CardTitle>Parent task</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Link href={`/risk/tasks/${task.parent.id}`} className="block font-medium text-brand hover:underline">
                    {task.parent.reference} · {task.parent.title}
                  </Link>
                  <p className="text-muted-foreground">{TASK_STATUS_LABELS[task.parent.status]}</p>
                  {task.siblingProgress && (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {task.siblingProgress.completed} of {task.siblingProgress.total} sub-tasks completed
                      </p>
                      <ProgressBar value={(task.siblingProgress.completed / Math.max(1, task.siblingProgress.total)) * 100} label="Sub-task progress" />
                    </>
                  )}
                </CardContent>
              </Card>
            )}
            {task.subTaskCount > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Sub-task progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <ProgressBar value={((task.subTaskCount - task.openSubTasks) / task.subTaskCount) * 100} label="Sub-task progress" />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        <TabsContent value="subtasks">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sub-tasks</CardTitle>
              {p.addSubTask && (
                <Button size="sm" variant="outline" onClick={() => setSheet({ mode: "create", parent: task })}>
                  <Plus /> Add sub-task
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <TaskList tasks={task.subTasks} empty={task.parentId ? "Sub-tasks cannot have their own sub-tasks." : "No sub-tasks."} showProgramme={false} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="evidence">
          <EvidencePanel entityType="RiskTask" entityId={task.id} readOnly={!(p.work || p.edit)} />
        </TabsContent>
        <TabsContent value="comments">
          <CommentsPanel entityType="RiskTask" entityId={task.id} />
        </TabsContent>
      </Tabs>

      {sheet && <TaskFormSheet open onOpenChange={(o) => !o && setSheet(null)} config={sheet} />}
      {completing && <CompleteTaskDialog open onOpenChange={(o) => !o && setCompleting(false)} task={task} />}
    </>
  );
}
