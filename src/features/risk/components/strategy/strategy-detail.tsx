"use client";

import { ChevronRight, FileSearch, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CommentsPanel } from "@/components/common/comments-panel";
import { EvidencePanel } from "@/components/common/evidence-panel";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { PERMISSIONS } from "@/lib/permissions";
import { TARGET_DIRECTION_LABELS } from "@/lib/risk/labels";
import { useObjective, useProgramme, useTarget, type ProgrammeDto, type TargetDto } from "../../api";
import { formatDate, formatMoney, formatNumber, placementLabel } from "../../format";
import { Detail, ProgressBar, StrategyStatusBadge } from "../shared";
import { TaskFormSheet } from "../tasks/task-form-sheet";
import { TaskList } from "../tasks/task-list";
import { StrategyFormSheet, type StrategySheet } from "./strategy-forms";

function NotFound({ what, error, retry }: { what: string; error: unknown; retry: () => void }) {
  if (error instanceof ApiError && error.status === 404) return <EmptyState icon={FileSearch} title={`${what} not found`} description="It does not exist or you do not have access to it." className="mt-6" />;
  return <ErrorState error={error} onRetry={retry} />;
}

function TargetRows({ targets }: { targets: TargetDto[] }) {
  if (!targets.length) return <p className="py-4 text-center text-sm text-muted-foreground">No targets yet.</p>;
  return (
    <ul className="-mx-2 divide-y">
      {targets.map((t) => (
        <li key={t.id}>
          <Link href={`/risk/strategy/targets/${t.id}`} className="flex flex-col gap-1.5 rounded-lg px-2 py-2.5 hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {TARGET_DIRECTION_LABELS[t.direction]} {formatNumber(t.baseline)} → {formatNumber(t.goal)} {t.unit} · now {formatNumber(t.current)} · due {formatDate(t.deadline)}
              </p>
            </div>
            <ProgressBar value={t.progress} className="sm:w-40" label="Target progress" />
            <StrategyStatusBadge status={t.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProgrammeRows({ programmes }: { programmes: ProgrammeDto[] }) {
  if (!programmes.length) return <p className="py-4 text-center text-sm text-muted-foreground">No programmes yet.</p>;
  return (
    <ul className="-mx-2 divide-y">
      {programmes.map((p) => (
        <li key={p.id}>
          <Link href={`/risk/strategy/programmes/${p.id}`} className="flex flex-col gap-1.5 rounded-lg px-2 py-2.5 hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {p.owner.name} · {formatDate(p.startDate)} – {formatDate(p.deadline)} · {p.taskCount - p.openTasks}/{p.taskCount} tasks done
              </p>
            </div>
            <ProgressBar value={p.progress} className="sm:w-40" label="Task progress" />
            <StrategyStatusBadge status={p.status} />
            <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ObjectiveDetail({ id }: { id: string }) {
  const query = useObjective(id);
  const { can } = useCurrentUser();
  const [sheet, setSheet] = useState<StrategySheet | null>(null);
  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) return <NotFound what="Objective" error={query.error} retry={() => query.refetch()} />;
  const o = query.data;
  return (
    <>
      <PageHeader
        title={o.title}
        backHref="/risk/strategy"
        backLabel="Objectives & programmes"
        meta={
          <>
            <StatusBadge tone="neutral">Objective</StatusBadge>
            <StrategyStatusBadge status={o.status} />
            {o.domain && <StatusBadge tone="brand">{o.domain}</StatusBadge>}
            {o.overdue && <StatusBadge tone="danger">Past deadline</StatusBadge>}
          </>
        }
        actions={
          o.permissions.edit ? (
            <Button variant="outline" onClick={() => setSheet({ kind: "objective", record: o })}>
              <Pencil /> Edit
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Objective</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Detail label="Desired outcome">{o.description}</Detail>
              <Detail label="Where">{placementLabel(o.placement)}</Detail>
              <Detail label="Owner">{o.owner.name}</Detail>
              <Detail label="Deadline">{formatDate(o.deadline)}</Detail>
              <Detail label="Average target progress">
                <ProgressBar value={o.progress} label="Average target progress" />
              </Detail>
            </dl>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Targets</CardTitle>
                <CardDescription>How the objective is measured.</CardDescription>
              </div>
              {can(PERMISSIONS.RISK_CREATE) && (
                <Button size="sm" variant="outline" onClick={() => setSheet({ kind: "target", objectiveId: o.id })}>
                  <Plus /> Target
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <TargetRows targets={o.targets} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Management programmes</CardTitle>
                <CardDescription>The planned work and its tasks.</CardDescription>
              </div>
              {can(PERMISSIONS.RISK_CREATE) && o.targets.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setSheet({ kind: "programme", objectiveId: o.id })}>
                  <Plus /> Programme
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <ProgrammeRows programmes={o.programmes} />
            </CardContent>
          </Card>
        </div>
      </div>
      <StrategyFormSheet sheet={sheet} onClose={() => setSheet(null)} />
    </>
  );
}

export function TargetDetail({ id }: { id: string }) {
  const query = useTarget(id);
  const [sheet, setSheet] = useState<StrategySheet | null>(null);
  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) return <NotFound what="Target" error={query.error} retry={() => query.refetch()} />;
  const t = query.data;
  return (
    <>
      <PageHeader
        title={t.title}
        backHref={`/risk/strategy/objectives/${t.objective.id}`}
        backLabel={t.objective.title}
        meta={
          <>
            <StatusBadge tone="neutral">Target</StatusBadge>
            <StrategyStatusBadge status={t.status} />
            {t.goalReached && <StatusBadge tone="success">Goal reached</StatusBadge>}
            {t.overdue && <StatusBadge tone="danger">Past deadline</StatusBadge>}
          </>
        }
        actions={
          t.permissions.edit ? (
            <Button variant="outline" onClick={() => setSheet({ kind: "target", record: t })}>
              <Pencil /> Update measurement
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Measurement</CardTitle>
            <CardDescription>
              {TARGET_DIRECTION_LABELS[t.direction]} from {formatNumber(t.baseline)} to {formatNumber(t.goal)} {t.unit}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Baseline", t.baseline],
                ["Current", t.current],
                ["Goal", t.goal],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold tabular-nums">{formatNumber(value as number)}</p>
                </div>
              ))}
            </div>
            <ProgressBar value={t.progress} label="Target progress" />
            <dl className="space-y-3">
              <Detail label="Objective">
                <Link className="text-brand hover:underline" href={`/risk/strategy/objectives/${t.objective.id}`}>
                  {t.objective.title}
                </Link>
              </Detail>
              <Detail label="Owner">{t.owner.name}</Detail>
              <Detail label="Deadline">{formatDate(t.deadline)}</Detail>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Programmes working on this target</CardTitle>
          </CardHeader>
          <CardContent>
            <ProgrammeRows programmes={t.programmes} />
          </CardContent>
        </Card>
      </div>
      <StrategyFormSheet sheet={sheet} onClose={() => setSheet(null)} />
    </>
  );
}

export function ProgrammeDetail({ id }: { id: string }) {
  const router = useRouter();
  const query = useProgramme(id);
  const [sheet, setSheet] = useState<StrategySheet | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) return <NotFound what="Programme" error={query.error} retry={() => query.refetch()} />;
  const p = query.data;
  return (
    <>
      <PageHeader
        title={p.title}
        backHref={`/risk/strategy/objectives/${p.objective.id}`}
        backLabel={p.objective.title}
        meta={
          <>
            <StatusBadge tone="neutral">Management programme</StatusBadge>
            <StrategyStatusBadge status={p.status} />
            {p.overdue && <StatusBadge tone="danger">Past deadline</StatusBadge>}
          </>
        }
        actions={
          <>
            {p.permissions.createTask && (
              <Button onClick={() => setTaskOpen(true)}>
                <Plus /> Add task
              </Button>
            )}
            {p.permissions.edit && (
              <Button variant="outline" onClick={() => setSheet({ kind: "programme", record: p })}>
                <Pencil /> Edit
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Programme</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <Detail label="Objective">
                  <Link className="text-brand hover:underline" href={`/risk/strategy/objectives/${p.objective.id}`}>
                    {p.objective.title}
                  </Link>
                </Detail>
                <Detail label="Where">{placementLabel(p.placement)}</Detail>
                <Detail label="Owner">{p.owner.name}</Detail>
                <Detail label="Period">
                  {formatDate(p.startDate)} – {formatDate(p.deadline)}
                </Detail>
                <Detail label="Budget">{formatMoney(p.budget)}</Detail>
                <Detail label="Means, resources and scope">{p.means}</Detail>
                <Detail label="Task progress">
                  <ProgressBar value={p.progress} label="Task progress" />
                  <span className="text-xs text-muted-foreground">
                    {p.taskCount - p.openTasks} of {p.taskCount} linked tasks completed
                  </span>
                </Detail>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Linked targets</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {p.targets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/risk/strategy/targets/${t.id}`} className="block text-sm font-medium hover:underline">
                      {t.title}
                    </Link>
                    <ProgressBar value={t.progress} label={`${t.title} progress`} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>Completing the programme needs every task completed.</CardDescription>
            </CardHeader>
            <CardContent>
              <TaskList tasks={p.tasks} showProgramme={false} showAssessment empty="No tasks yet – add the first piece of work." />
            </CardContent>
          </Card>
          <EvidencePanel entityType="RiskProgramme" entityId={p.id} readOnly={!p.permissions.edit} />
          <CommentsPanel entityType="RiskProgramme" entityId={p.id} />
        </div>
      </div>
      <StrategyFormSheet sheet={sheet} onClose={() => setSheet(null)} />
      {taskOpen && <TaskFormSheet open onOpenChange={(o) => !o && setTaskOpen(false)} config={{ mode: "create", kind: "MP", programmeId: p.id }} onSaved={(tid) => router.push(`/risk/tasks/${tid}`)} />}
    </>
  );
}
