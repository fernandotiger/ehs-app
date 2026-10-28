"use client";

import { Archive, ArchiveRestore, CheckCircle2, FileSearch, MoreHorizontal, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { CommentsPanel } from "@/components/common/comments-panel";
import { EvidencePanel } from "@/components/common/evidence-panel";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LAW_TASK_PRIORITY_LABELS } from "@/lib/law";
import { ApiError, errorMessage } from "@/lib/api-client";
import { useArchiveLawTask, useLawTask, type LawTaskDetailDto } from "../../api";
import { formatDate } from "../../format";
import { LawHistory, LawPriorityBadge, LawStepper, LawTaskStatusBadge } from "../shared";
import { CompleteLawTaskDialog, LawTaskSheet } from "./task-sheet";

export function LawTaskDetail({ id }: { id: string }) {
  const query = useLawTask(id);
  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Task not found" description="It does not exist or you do not have access to it." className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <Detail t={query.data} />;
}

function Detail({ t }: { t: LawTaskDetailDto }) {
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const archive = useArchiveLawTask(t.id);
  const p = t.permissions;

  async function setArchived(archived: boolean) {
    try {
      await archive.mutateAsync({ archived, expectedVersion: t.version });
      toast.success(archived ? `${t.reference} archived` : `${t.reference} restored`);
    } catch (error) {
      toast.error(isStaleVersion(error) ? "Someone else changed this task – reload to see their changes." : errorMessage(error));
    }
  }

  const more = [
    p.edit ? { key: "edit", icon: Pencil, label: "Edit task", onSelect: () => setEditing(true) } : null,
    p.archive ? { key: "archive", icon: Archive, label: "Archive task", onSelect: () => void setArchived(true) } : null,
    p.restore ? { key: "restore", icon: ArchiveRestore, label: "Restore task", onSelect: () => void setArchived(false) } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const steps = [
    { key: "OPEN", label: "To do", state: t.status === "OPEN" ? ("current" as const) : ("done" as const) },
    { key: "DONE", label: "Done", state: t.status === "COMPLETED" ? ("done" as const) : ("todo" as const) },
  ];

  return (
    <>
      <PageHeader
        title={t.title}
        backHref="/law/tasks"
        backLabel="Law tasks"
        meta={
          <>
            <StatusBadge tone="neutral">{t.reference}</StatusBadge>
            <LawTaskStatusBadge status={t.status} overdue={t.overdue} archived={t.archived} />
            <LawPriorityBadge priority={t.priority} />
          </>
        }
        actions={
          <>
            {p.work && (
              <Button onClick={() => setCompleting(true)}>
                <CheckCircle2 /> Mark as done
              </Button>
            )}
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
      <LawStepper steps={steps} />

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="px-3">Overview</TabsTrigger>
          <TabsTrigger value="evidence" className="px-3">Evidence</TabsTrigger>
          <TabsTrigger value="history" className="px-3">History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>What needs to be done</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  <Item label="Details">{t.details ? <span className="whitespace-pre-wrap">{t.details}</span> : null}</Item>
                  <Item label="Who does it">{t.assignedToMe ? `${t.owner.name} (me)` : t.owner.name}</Item>
                  <Item label="Due">
                    <span className={t.overdue ? "font-medium text-destructive" : undefined}>
                      {formatDate(t.dueDate)}
                      {t.overdue ? " · overdue" : ""}
                    </span>
                  </Item>
                  <Item label="Priority">{LAW_TASK_PRIORITY_LABELS[t.priority]}</Item>
                  <Item label="Department">{t.departmentName}</Item>
                  <Item label="Asked by">
                    {t.createdBy.name} · {formatDate(t.createdOn)}
                  </Item>
                </dl>
              </CardContent>
            </Card>
            <CommentsPanel entityType="LawTask" entityId={t.id} />
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>For this requirement</CardTitle>
                <CardDescription>{t.profile.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={`/law/requirements/${t.requirement.id}`} className="block rounded-lg border p-3 hover:bg-muted/50">
                  <span className="block text-sm font-medium">{t.requirement.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.requirement.reference} · {t.requirement.register} · {t.requirement.category}
                  </span>
                </Link>
              </CardContent>
            </Card>
            {t.status === "COMPLETED" ? (
              <Card className="border-success/40">
                <CardHeader>
                  <CardTitle>Done</CardTitle>
                  <CardDescription>
                    {t.completedOn ? formatDate(t.completedOn) : ""}
                    {t.completedByName ? ` by ${t.completedByName}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="whitespace-pre-wrap">{t.completionNotes}</p>
                  <p className="text-xs text-muted-foreground">If the situation changed, update the requirement&apos;s check – it is not updated automatically.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Next step</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t.archived ? "This task is archived. Restore it to work on it again." : p.work ? "When it is done, press Mark as done and say what was done." : `${t.owner.name} is doing this task.`}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        <TabsContent value="evidence">
          <EvidencePanel entityType="LawTask" entityId={t.id} readOnly={!(p.work || p.edit)} />
        </TabsContent>
        <TabsContent value="history">
          <LawHistory kind="tasks" id={t.id} />
        </TabsContent>
      </Tabs>

      {editing && <LawTaskSheet open task={t} onOpenChange={(o) => !o && setEditing(false)} />}
      {completing && <CompleteLawTaskDialog open task={t} onOpenChange={(o) => !o && setCompleting(false)} />}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
