"use client";

import { ChevronRight, History, Link2, ListChecks, Lock, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { LinkedRecords } from "@/components/common/linked-records";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { QuestionnaireAnswers } from "@/features/forms/components/questionnaire-answers";
import { errorMessage } from "@/lib/api-client";
import { ACTION_KIND_LABELS, INVOLVEMENT_LABELS, PERSON_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/incidents";
import { useActions, useIncidentHistory, useLinkAction, type IncidentDetailDto } from "../../api";
import { blockersOf, formatDate, formatDateTime, HISTORY_LABELS, placementLabel } from "../../format";
import { ActionStateBadge, Detail, SectionHeading } from "../shared";

export function OverviewTab({ incident }: { incident: IncidentDetailDto }) {
  const answersSnapshot = incident.reportForm;
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>What happened</CardTitle>
          {incident.confidentialHidden && (
            <CardDescription className="flex items-center gap-1.5">
              <Lock className="size-3.5" /> Confidential – the narrative, people and answers are only visible to people allowed to see confidential details.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            {!incident.confidentialHidden && <Detail label="What happened?">{incident.narrative}</Detail>}
            <Detail label="When">{formatDateTime(incident.occurredAt)}</Detail>
            <Detail label="Where">{[placementLabel(incident.placement), incident.preciseLocation].filter(Boolean).join(" · ")}</Detail>
            <Detail label="Shift">{incident.shift}</Detail>
            <Detail label="Type">{[incident.typeLabel, incident.subtype?.label].filter(Boolean).join(" · ")}</Detail>
            <Detail label="Severity">{SEVERITY_LABELS[incident.severity]}</Detail>
            {!incident.confidentialHidden && <Detail label="Immediate action">{incident.immediateAction}</Detail>}
            {!incident.confidentialHidden && <Detail label="First aid / treatment">{incident.firstAid}</Detail>}
            <Detail label="Nurse notified">{incident.nurseNotified ? "Yes" : "No"}</Detail>
          </dl>
          {answersSnapshot && !incident.confidentialHidden && answersSnapshot.fields.some((f) => !incident.hiddenAnswerKeys.includes(f.key)) && (
            <div className="mt-5 border-t pt-4">
              <h3 className="mb-3 text-sm font-semibold">
                Report questions <span className="font-normal text-muted-foreground">· {answersSnapshot.name} v{answersSnapshot.version}</span>
              </h3>
              <QuestionnaireAnswers snapshot={answersSnapshot} answers={incident.answers} hideKeys={incident.hiddenAnswerKeys} />
            </div>
          )}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Responsibility</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Detail label="Reported by">{`${incident.reporter.name}${incident.submittedAt ? ` · ${formatDate(incident.submittedAt)}` : " · draft"}`}</Detail>
              <Detail label="Investigators">{incident.investigators.map((i) => i.name).join(", ") || null}</Detail>
              <Detail label="Investigation target">{formatDate(incident.investigationTargetDate)}</Detail>
              <Detail label="Also told">{incident.notifyUsers.map((u) => u.name).join(", ") || null}</Detail>
              <Detail label="Confidential">{incident.isConfidential ? "Yes" : "No"}</Detail>
              <Detail label="Days lost">{incident.daysLost}</Detail>
            </dl>
          </CardContent>
        </Card>
        {incident.closedAt && (
          <Card>
            <CardHeader>
              <CardTitle>Closure</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <Detail label="Closed">{`${formatDateTime(incident.closedAt)}${incident.closedBy ? ` by ${incident.closedBy.name}` : ""}`}</Detail>
                <Detail label="Note">{incident.closureNote}</Detail>
              </dl>
            </CardContent>
          </Card>
        )}
        {incident.source && (
          <Card>
            <CardHeader>
              <CardTitle>Raised from</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">{incident.source.href ? <Link className="text-brand hover:underline" href={incident.source.href}>{incident.source.label}</Link> : incident.source.label}</CardContent>
          </Card>
        )}
        <LinkedRecords entityType="Incident" entityId={incident.id} />
      </div>
    </div>
  );
}

export function PeopleTab({ incident }: { incident: IncidentDetailDto }) {
  if (incident.confidentialHidden) return <EmptyState icon={Lock} title="Confidential" description="The people involved are only visible to people allowed to see confidential details." />;
  if (!incident.people.length) return <EmptyState icon={UserRound} title="No people recorded" description={incident.permissions.edit ? "Edit the report to add the people involved." : undefined} />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {incident.people.map((p) => (
        <Card key={p.id} className="gap-2 py-4">
          <CardContent className="space-y-2 px-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{p.name}</p>
              <StatusBadge tone={p.involvement === "INJURED" ? "danger" : "neutral"}>{INVOLVEMENT_LABELS[p.involvement]}</StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground">{PERSON_TYPE_LABELS[p.personType]}</p>
            {(p.injuryType || p.bodyPart) && <p className="text-sm">{[p.injuryType, p.bodyPart].filter(Boolean).join(" · ")}</p>}
            {p.injuryDetails && <p className="whitespace-pre-wrap text-sm">{p.injuryDetails}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ActionsTab({ incident, onAdd }: { incident: IncidentDetailDto; onAdd: () => void }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const canAdd = incident.permissions.raiseAction && !incident.closedAt;
  return (
    <div>
      <SectionHeading
        title="Actions"
        description="Corrective and preventive actions for this incident. A shared action shows the same progress on every incident it is linked to."
        actions={
          canAdd ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
                <Link2 /> Link existing action
              </Button>
              <Button size="sm" onClick={onAdd}>
                <Plus /> Add action
              </Button>
            </>
          ) : undefined
        }
      />
      {incident.actions.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No actions yet"
          description={incident.investigation?.actionsRequired ? "The investigation says action is required." : "Add an action when something needs to change."}
        />
      ) : (
        <ul className="space-y-2">
          {incident.actions.map((a) => (
            <li key={a.id}>
              <Link href={`/incidents/actions/${a.id}`} className="flex flex-col gap-2 rounded-xl border bg-card p-3 hover:bg-muted/40 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground">{a.reference} · </span>
                    {a.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ACTION_KIND_LABELS[a.kind]} · {a.owner.name} · due {formatDate(a.dueDate)}
                    {a.taskCount ? ` · tasks ${a.tasksDone}/${a.taskCount}` : ""}
                    {a.incidentCount > 1 ? ` · shared with ${a.incidentCount - 1} other incident${a.incidentCount > 2 ? "s" : ""}` : ""}
                    {a.parentActionId ? " · follow-up" : ""}
                  </p>
                </div>
                <ActionStateBadge state={a.state} overdue={a.overdue} />
                {a.state === "INEFFECTIVE" && <StatusBadge tone={a.resolved ? "success" : "danger"}>{a.resolved ? "Resolved by follow-up" : "Follow-up needed"}</StatusBadge>}
                <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <LinkActionDialog open={linkOpen} onOpenChange={setLinkOpen} incidentId={incident.id} />
    </div>
  );
}

function LinkActionDialog({ open, onOpenChange, incidentId }: { open: boolean; onOpenChange: (o: boolean) => void; incidentId: string }) {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const actions = useActions({ page: 1, pageSize: 10, q: q || undefined, excludeIncidentId: incidentId }, open);
  const link = useLinkAction();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link an existing action</DialogTitle>
          <DialogDescription>Use one shared action when it addresses this incident too. Its progress shows on every linked incident.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search by reference or description" value={search} onChange={(e) => setSearch(e.target.value)} />
        {actions.isPending ? (
          <LoadingRows rows={3} />
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {(actions.data?.items ?? []).length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No open actions found.</li>}
            {actions.data?.items.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={link.isPending}
                  className="flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-sm hover:bg-muted/50"
                  onClick={async () => {
                    try {
                      await link.mutateAsync({ actionId: a.id, incidentId });
                      toast.success(`${a.reference} linked`);
                      onOpenChange(false);
                    } catch (error) {
                      const b = blockersOf(error);
                      toast.error(b.length ? b.join(" ") : errorMessage(error));
                    }
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {a.reference} · {a.description}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {a.owner.name} · due {formatDate(a.dueDate)} · {a.siteName ?? "no site"}
                    </span>
                  </span>
                  <ActionStateBadge state={a.state} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
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
    } else if (typeof value === "string" && value.length < 200) out.push(`${key}: ${value}`);
  }
  return out.slice(0, 6);
}

function metaReference(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { reference?: unknown }).reference;
  return typeof value === "string" ? value : null;
}

export function HistoryTab({ incidentId }: { incidentId: string }) {
  const [page, setPage] = useState(1);
  const history = useIncidentHistory(incidentId, page);
  if (history.isPending) return <LoadingRows rows={5} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (!history.data.items.length) return <EmptyState icon={History} title="No history yet" />;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>History</CardTitle>
        <CardDescription>Signed audit trail – reopening and changes never remove earlier entries.</CardDescription>
      </CardHeader>
      <ul className="divide-y">
        {history.data.items.map((e) => (
          <li key={e.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{HISTORY_LABELS[e.action] ?? e.action.replace(/_/g, " ").toLowerCase()}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(e.createdAt)} · {e.actorName ?? "System"}
              </p>
            </div>
            {describeChanges(e.changes).map((line) => (
              <p key={line} className="text-xs text-muted-foreground">
                {line}
              </p>
            ))}
            {metaReference(e.metadata) && <p className="text-xs text-muted-foreground">{metaReference(e.metadata)}</p>}
          </li>
        ))}
      </ul>
      <div className="border-t px-3">
        <PaginationBar page={page} pageSize={history.data.pageSize} total={history.data.total} onPageChange={setPage} />
      </div>
    </Card>
  );
}
