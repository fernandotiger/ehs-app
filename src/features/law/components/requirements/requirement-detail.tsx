"use client";

import { Archive, ArchiveRestore, Ban, ClipboardCheck, ExternalLink, FileSearch, Link2, ListPlus, ListTodo, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CommentsPanel } from "@/components/common/comments-panel";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EvidencePanel } from "@/components/common/evidence-panel";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuestionnaireAnswers } from "@/features/forms/components/questionnaire-answers";
import { EVALUATION_STATUS_HINTS, LAW_LEVEL_HINTS } from "@/lib/law";
import { ApiError, errorMessage } from "@/lib/api-client";
import { useArchiveOtherRequirement, useIncludeRequirement, useLawFollowUps, useLawLinks, useLawRequirement, useLawTasks, useUnlinkRecord, type LawRequirementDetailDto } from "../../api";
import { dueLabel, formatDate } from "../../format";
import { OtherRequirementSheet } from "../profiles/other-requirement-sheet";
import { EvaluationStatusBadge, LawDisclaimer, LawHistory, LawStepper, LawTaskStatusBadge, RatingBadge } from "../shared";
import { LawTaskSheet } from "../tasks/task-sheet";
import { EvaluationSheet } from "./evaluation-sheet";
import { ExcludeDialog, LinkRecordDialog, RaiseActionDialog, RaiseIncidentDialog } from "./requirement-dialogs";

type Open = null | "evaluate" | "exclude" | "link" | "incident" | "action" | "task" | "edit";

export function RequirementDetail({ id }: { id: string }) {
  const query = useLawRequirement(id);
  if (query.isPending) return <LoadingRows rows={5} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Requirement not found" description="It does not exist or you do not have access to it." className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <Detail r={query.data} />;
}

const PRIMARY = {
  check: { label: "Check compliance", icon: ClipboardCheck },
  finish: { label: "Finish the check", icon: ClipboardCheck },
  review: { label: "Review the change", icon: TriangleAlert },
  recheck: { label: "Review again", icon: ClipboardCheck },
  restore: { label: "It applies again", icon: RotateCcw },
} as const;

function Detail({ r }: { r: LawRequirementDetailDto }) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [archiving, setArchiving] = useState(false);
  const include = useIncludeRequirement(r.id);
  const archive = useArchiveOtherRequirement(r.id);
  const followUps = useLawFollowUps(r.id);
  const existingIncident = followUps.data?.find((f) => f.kind === "incident");
  const p = r.permissions;
  const close = (o: boolean) => !o && setOpen(null);

  async function restore() {
    try {
      await include.mutateAsync(r.version);
      toast.success("It applies again – the earlier check is back");
    } catch (error) {
      toast.error(isStaleVersion(error) ? "Someone else changed this requirement – reload to see their changes." : errorMessage(error));
    }
  }

  async function setArchived(archived: boolean) {
    try {
      await archive.mutateAsync({ archived, expectedVersion: r.version });
      toast.success(archived ? "Company requirement archived" : "Company requirement restored");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const step = r.nextStep ? PRIMARY[r.nextStep] : null;
  const primary = step ? (
    <Button onClick={() => (r.nextStep === "restore" ? void restore() : setOpen("evaluate"))} disabled={include.isPending}>
      <step.icon /> {step.label}
    </Button>
  ) : p.evaluate && r.isRelevant && r.inScope ? (
    <Button variant="outline" onClick={() => setOpen("evaluate")}>
      <Pencil /> Update the check
    </Button>
  ) : null;

  const work = p.evaluate && r.inScope;
  const more = [
    work && r.isRelevant ? { key: "task", icon: ListTodo, label: "Add a task", onSelect: () => setOpen("task") } : null,
    work ? { key: "link", icon: Link2, label: "Link a risk assessment or incident", onSelect: () => setOpen("link") } : null,
    work && r.modules.incidents
      ? existingIncident
        ? { key: "incident", icon: ExternalLink, label: "Open the Non Compliance incident", onSelect: () => router.push(existingIncident.href) }
        : { key: "incident", icon: TriangleAlert, label: "Report as an incident", onSelect: () => setOpen("incident") }
      : null,
    work && r.modules.incidents ? { key: "action", icon: ListPlus, label: "Raise a corrective action", onSelect: () => setOpen("action") } : null,
    work && r.isRelevant ? { key: "exclude", icon: Ban, label: "This doesn't apply to us", onSelect: () => setOpen("exclude") } : null,
    p.editRequirement && !r.archived ? { key: "edit", icon: Pencil, label: "Edit company requirement", onSelect: () => setOpen("edit"), separated: true } : null,
    p.editRequirement && !r.archived ? { key: "archive", icon: Archive, label: "Archive company requirement", onSelect: () => setArchiving(true) } : null,
    p.editRequirement && r.archived ? { key: "unarchive", icon: ArchiveRestore, label: "Restore company requirement", onSelect: () => void setArchived(false) } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <>
      <PageHeader
        title={r.title}
        backHref={p.openProfile ? `/law/requirements?profile=${r.profile.id}` : "/law/tasks"}
        backLabel={p.openProfile ? "Laws that apply to us" : "Law tasks"}
        meta={
          <>
            <StatusBadge tone="neutral">{r.reference}</StatusBadge>
            <EvaluationStatusBadge status={r.status} reviewOverdue={r.reviewOverdue} />
            {r.kind === "OTHER" && <StatusBadge tone="purple">Company requirement</StatusBadge>}
            {!r.inScope && <StatusBadge tone="warning">Outside this profile</StatusBadge>}
            {r.archived && <StatusBadge tone="neutral">Archived</StatusBadge>}
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
                    <div key={m.key}>
                      {"separated" in m && m.separated && <DropdownMenuSeparator />}
                      <DropdownMenuItem onSelect={m.onSelect}>
                        <m.icon /> {m.label}
                      </DropdownMenuItem>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <LawStepper steps={r.lifecycle} />

      {r.reviewRequired && r.isRelevant && (
        <Alert className="mb-4 border-warning/50 bg-warning/10">
          <TriangleAlert className="text-[#9a5b00]" />
          <AlertTitle>The law changed – review needed</AlertTitle>
          <AlertDescription>{r.reviewReason ?? "Review your controls and evidence, then confirm the review in the check."}</AlertDescription>
        </Alert>
      )}
      {!r.inScope && (
        <Alert className="mb-4">
          <FileSearch />
          <AlertTitle>Outside this profile</AlertTitle>
          <AlertDescription>
            {r.archived ? "This company requirement is archived." : "It no longer matches the profile's activities or the accepted legal content."} Everything recorded is kept here for reference.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview" className="px-3">Overview</TabsTrigger>
          <TabsTrigger value="evaluation" className="px-3">Check</TabsTrigger>
          <TabsTrigger value="tasks" className="px-3">Tasks{r.openTasks ? ` (${r.openTasks})` : ""}</TabsTrigger>
          <TabsTrigger value="links" className="px-3">Risk &amp; incidents</TabsTrigger>
          <TabsTrigger value="evidence" className="px-3">Evidence</TabsTrigger>
          <TabsTrigger value="history" className="px-3">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>What the requirement asks</CardTitle>
                <CardDescription>
                  {r.register} · {r.category} · {r.kind === "OTHER" ? "your own requirement" : `legal content ${r.contentVersion}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap text-sm">{r.requirementText || "—"}</p>
                {r.legislation.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Based on</h3>
                    <ul className="-mx-2 divide-y">
                      {r.legislation.map((l) => (
                        <li key={l.id}>
                          <Link href={`/law/library/${l.id}?profile=${r.profile.id}`} className="block rounded-lg px-2 py-2 hover:bg-muted/50">
                            <span className="block text-sm font-medium">{l.title}</span>
                            <span className="block text-xs text-muted-foreground">
                              {l.reference} · {l.level} – {LAW_LEVEL_HINTS[l.level]}
                              {!l.active ? " · no longer active" : ""}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.keywords.map((k) => (
                      <StatusBadge key={k} tone="neutral">
                        {k}
                      </StatusBadge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Our check</CardTitle>
                <CardDescription>{EVALUATION_STATUS_HINTS[r.status]}</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  {!r.isRelevant && <Item label="Why it doesn't apply">{r.exclusionReason}</Item>}
                  <Item label="Responsible">{r.owner?.name}</Item>
                  <Item label="Department">{r.departmentName}</Item>
                  <Item label="Last checked">{r.evaluatedOn ? formatDate(r.evaluatedOn) : null}</Item>
                  <Item label="Next review">
                    <span className={r.reviewOverdue ? "font-medium text-destructive" : undefined}>
                      {dueLabel(r.nextReviewDate)}
                      {r.reviewOverdue ? " · overdue" : ""}
                    </span>
                  </Item>
                  {r.profile.showRating && (
                    <Item label="Self-assessed rating">
                      <RatingBadge rating={r.rating} />
                    </Item>
                  )}
                  <Item label="Profile">
                    {p.openProfile ? (
                      <Link href={`/law/profiles/${r.profile.id}`} className="text-brand hover:underline">
                        {r.profile.name}
                      </Link>
                    ) : (
                      r.profile.name
                    )}
                    {r.profileSiteName ? ` · ${r.profileSiteName}` : ""}
                  </Item>
                </dl>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Next step</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>{nextStepText(r)}</p>
                {r.missing.length > 0 && r.isRelevant && (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs">
                    {r.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
                {primary}
              </CardContent>
            </Card>
            <LawDisclaimer />
          </div>
        </TabsContent>

        <TabsContent value="evaluation" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle>Why it applies and how we checked</CardTitle>
                <CardDescription>Every save is kept in History.</CardDescription>
              </div>
              {p.evaluate && r.isRelevant && r.inScope && (
                <Button size="sm" variant="outline" onClick={() => setOpen("evaluate")}>
                  <Pencil /> Edit
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <Narrative title="Why it applies – controls and who maintains them" text={r.relevanceNotes} />
              <Narrative title="How we checked – evidence, findings and gaps" text={r.evaluationNotes} />
            </CardContent>
          </Card>
          {r.form && r.form.fields.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>More questions</CardTitle>
                <CardDescription>
                  {r.form.name} · version {r.form.version}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <QuestionnaireAnswers snapshot={r.form} answers={r.answers} />
              </CardContent>
            </Card>
          )}
          <CommentsPanel entityType="LawRequirement" entityId={r.id} />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab r={r} onAdd={work && r.isRelevant ? () => setOpen("task") : undefined} />
        </TabsContent>

        <TabsContent value="links">
          <LinksTab r={r} onLink={work ? () => setOpen("link") : undefined} onIncident={work && r.modules.incidents && !existingIncident ? () => setOpen("incident") : undefined} onAction={work && r.modules.incidents ? () => setOpen("action") : undefined} />
        </TabsContent>

        <TabsContent value="evidence">
          <EvidencePanel entityType="LawRequirement" entityId={r.id} readOnly={!p.evidence} title="Evidence" />
        </TabsContent>

        <TabsContent value="history">
          <LawHistory kind="requirements" id={r.id} />
        </TabsContent>
      </Tabs>

      {open === "evaluate" && <EvaluationSheet open requirement={r} onOpenChange={close} />}
      {open === "exclude" && <ExcludeDialog open requirement={r} onOpenChange={close} />}
      {open === "link" && <LinkRecordDialog open requirement={r} onOpenChange={close} />}
      {open === "incident" && <RaiseIncidentDialog open requirement={r} onOpenChange={close} />}
      {open === "action" && <RaiseActionDialog open requirement={r} onOpenChange={close} />}
      {open === "task" && <LawTaskSheet open requirement={{ id: r.id, reference: r.reference, title: r.title, siteId: r.siteId, departmentId: r.departmentId }} onOpenChange={close} />}
      {open === "edit" && <OtherRequirementSheet open requirement={r} profileId={r.profile.id} profileName={r.profile.name} onOpenChange={close} />}
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="Archive this company requirement?"
        description="It moves out of the register. Its check, evidence, tasks and links are kept and you can restore it."
        confirmLabel="Archive"
        onConfirm={() => setArchived(true)}
      />
    </>
  );
}

function nextStepText(r: LawRequirementDetailDto): string {
  if (!r.inScope) return "Nothing to do – this requirement is outside the profile.";
  if (!r.permissions.evaluate) return r.owner ? `${r.owner.name} is responsible for this requirement.` : "Someone who manages legal requirements will check it.";
  switch (r.status) {
    case "NOT_RELEVANT":
      return "Marked as not applying. If that changes, mark it as applying again – the earlier check comes back.";
    case "REVIEW_REQUIRED":
      return "The requirement changed in a legal content update. Review your controls and evidence, then confirm the review in the check.";
    case "NOT_STARTED":
      return "Record why it applies, how you checked it, who is responsible and when to look again.";
    case "PARTIAL":
      return "Part of the check is recorded. Finish it so the requirement counts as checked.";
    case "COMPLETE":
      return r.reviewOverdue ? "The review date has passed. Look at it again and set the next review date." : "Checked. Add tasks for any gaps, and attach evidence on the Evidence tab.";
  }
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function Narrative({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {text ? <p className="whitespace-pre-wrap text-sm">{text}</p> : <p className="text-sm text-muted-foreground">Not written yet.</p>}
    </section>
  );
}

function TasksTab({ r, onAdd }: { r: LawRequirementDetailDto; onAdd?: () => void }) {
  const tasks = useLawTasks({ page: 1, pageSize: 50, requirementId: r.id, view: "all", status: "ALL" });
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-start justify-between gap-2 border-b py-4">
        <div>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>Work to close gaps. Finishing a task does not change the check.</CardDescription>
        </div>
        {onAdd && (
          <Button size="sm" onClick={onAdd}>
            <Plus /> Add a task
          </Button>
        )}
      </CardHeader>
      {tasks.isPending ? (
        <div className="p-4">
          <LoadingRows rows={3} />
        </div>
      ) : tasks.isError ? (
        <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
      ) : tasks.data.items.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <ul className="divide-y">
          {tasks.data.items.map((t) => (
            <li key={t.id}>
              <Link href={`/law/tasks/${t.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.reference} · {t.owner.name} · due {formatDate(t.dueDate)}
                  </span>
                </span>
                <LawTaskStatusBadge status={t.status} overdue={t.overdue} archived={t.archived} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LinksTab({ r, onLink, onIncident, onAction }: { r: LawRequirementDetailDto; onLink?: () => void; onIncident?: () => void; onAction?: () => void }) {
  const links = useLawLinks(r.id);
  const followUps = useLawFollowUps(r.id);
  const unlink = useUnlinkRecord(r.id);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Linked records</CardTitle>
            <CardDescription>Risk assessments, incidents and actions that relate to this requirement. They show this requirement too.</CardDescription>
          </div>
          {onLink && (
            <Button size="sm" variant="outline" onClick={onLink}>
              <Link2 /> Link
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {links.isPending ? (
            <LoadingRows rows={2} />
          ) : links.isError ? (
            <ErrorState error={links.error} onRetry={() => links.refetch()} className="py-6" />
          ) : links.data.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">Nothing linked yet.</p>
          ) : (
            <ul className="-mx-2 divide-y">
              {links.data.map((l) => (
                <li key={l.id} className="flex items-start gap-2 px-2 py-2.5">
                  <Link href={l.href} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate text-sm font-medium">{l.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {l.typeLabel}
                      {l.context ? ` · ${l.context}` : ""}
                    </span>
                  </Link>
                  {onLink && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove link to ${l.label}`}
                      disabled={unlink.isPending}
                      onClick={() =>
                        void unlink.mutateAsync(l.id).then(
                          () => toast.success("Link removed"),
                          (error: unknown) => toast.error(errorMessage(error)),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Raised from this requirement</CardTitle>
          <CardDescription>Incidents and corrective actions created here. Closing them does not change the check – update it yourself.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {followUps.isPending ? (
            <LoadingRows rows={2} />
          ) : followUps.isError ? (
            <ErrorState error={followUps.error} onRetry={() => followUps.refetch()} className="py-6" />
          ) : followUps.data.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">Nothing raised yet.</p>
          ) : (
            <ul className="-mx-2 divide-y">
              {followUps.data.map((f) => (
                <li key={f.id}>
                  <Link href={f.href} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{f.label}</span>
                      <span className="block text-xs text-muted-foreground">{f.kind === "incident" ? "Non Compliance incident" : "Corrective action"}</span>
                    </span>
                    <StatusBadge tone={f.resolved ? "success" : "info"}>{f.resolved ? "Resolved" : "Open"}</StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {(onIncident || onAction) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {onIncident && (
                <Button size="sm" variant="outline" onClick={onIncident}>
                  <TriangleAlert /> Report as an incident
                </Button>
              )}
              {onAction && (
                <Button size="sm" variant="outline" onClick={onAction}>
                  <ListPlus /> Raise a corrective action
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
