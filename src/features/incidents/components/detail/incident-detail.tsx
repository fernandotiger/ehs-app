"use client";

import { Archive, ArchiveRestore, CheckCircle2, ClipboardCheck, FileSearch, ListChecks, Lock, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Send } from "lucide-react";
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
import { UserPicker } from "@/components/common/user-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PublishedFormSelect } from "@/features/forms/components/published-form-select";
import { ApiError, errorMessage } from "@/lib/api-client";
import { PERMISSIONS } from "@/lib/permissions";
import { useIncident, useIncidentCommand, useIncidentTypes, useStartInvestigation, type IncidentDetailDto, type IncidentNextStep } from "../../api";
import { blockersOf } from "../../format";
import { ActionFormSheet } from "../actions/action-form-sheet";
import { BlockerList, IncidentStatusBadge, LifecycleStepper, SeverityBadge } from "../shared";
import { ActionsTab, HistoryTab, OverviewTab, PeopleTab } from "./incident-tabs";
import { InvestigationTab } from "./investigation-tab";

const TABS = ["overview", "people", "investigation", "actions", "evidence", "comments", "history"] as const;
type Tab = (typeof TABS)[number];

/** Incident detail: ONE primary next step, lifecycle stepper and tabs (Overview first, History last). */
export function IncidentDetail({ id }: { id: string }) {
  const query = useIncident(id);
  if (query.isPending) return <LoadingRows rows={6} className="[&>*:first-child]:h-20 [&>*]:h-24" />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Incident not found" description="It does not exist or you do not have access to it." className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <Detail incident={query.data} />;
}

function Detail({ incident }: { incident: IncidentDetailDto }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "overview";
  const setTab = (t: string) => router.replace(`${pathname}${t === "overview" ? "" : `?tab=${t}`}`, { scroll: false });
  const [dialog, setDialog] = useState<"start" | "close" | "reopen" | "action" | null>(null);
  const command = useIncidentCommand(incident.id);
  const [errorBlockers, setErrorBlockers] = useState<string[]>([]);

  async function run(cmd: "submit" | "archive" | "restore", success: string) {
    setErrorBlockers([]);
    try {
      await command.mutateAsync({ command: cmd, expectedVersion: incident.version });
      toast.success(success);
    } catch (error) {
      setErrorBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? "Someone else changed this incident – reload to see their changes." : errorMessage(error));
    }
  }

  const p = incident.permissions;
  const step = incident.archivedAt ? null : incident.nextStep;
  const primary = primaryButton(step, incident, {
    submit: () => (incident.submitBlockers.length ? router.push(`/incidents/${incident.id}/edit`) : void run("submit", `${incident.reference} submitted`)),
    start: () => setDialog("start"),
    investigation: () => setTab("investigation"),
    addAction: () => setDialog("action"),
    actions: () => setTab("actions"),
    close: () => setDialog("close"),
    reopen: () => setDialog("reopen"),
  });

  return (
    <>
      <PageHeader
        title={incident.title || "Untitled draft"}
        backHref="/incidents/register"
        backLabel="Incidents"
        meta={
          <>
            <StatusBadge tone="neutral">{incident.reference}</StatusBadge>
            <IncidentStatusBadge status={incident.status} />
            <SeverityBadge severity={incident.severity} />
            <StatusBadge tone="brand">{incident.typeLabel}</StatusBadge>
            {incident.isConfidential && (
              <StatusBadge tone="warning">
                <Lock className="size-3" /> Confidential
              </StatusBadge>
            )}
            {incident.archivedAt && <StatusBadge tone="warning">Archived</StatusBadge>}
          </>
        }
        actions={
          <>
            {primary}
            <MoreMenu incident={incident} onRun={run} onReopen={() => setDialog("reopen")} />
          </>
        }
      />

      <LifecycleStepper stages={incident.lifecycle} />
      {incident.isDraft && <BlockerList className="mb-4" title="This is a draft – before it can be submitted" blockers={incident.submitBlockers} />}
      {!incident.isDraft && !incident.closedAt && (step === "CLOSE" || step === "TRACK_ACTIONS" || step === "REVIEW_ACTIONS" || step === "FOLLOW_UP" || step === "ADD_ACTION") && (
        <BlockerList className="mb-4" title="Before this incident can be closed" blockers={incident.closureBlockers} />
      )}
      <BlockerList className="mb-4" title="Not done" blockers={errorBlockers} tone="destructive" />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
          <TabsList className="h-9">
            <TabsTrigger value="overview" className="px-3">Overview</TabsTrigger>
            <TabsTrigger value="people" className="px-3">People</TabsTrigger>
            <TabsTrigger value="investigation" className="px-3">Investigation</TabsTrigger>
            <TabsTrigger value="actions" className="px-3">Actions{incident.actions.length ? ` (${incident.actions.length})` : ""}</TabsTrigger>
            <TabsTrigger value="evidence" className="px-3">Evidence</TabsTrigger>
            <TabsTrigger value="comments" className="px-3">Comments</TabsTrigger>
            <TabsTrigger value="history" className="px-3">History</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview">
          <OverviewTab incident={incident} />
        </TabsContent>
        <TabsContent value="people">
          <PeopleTab incident={incident} />
        </TabsContent>
        <TabsContent value="investigation">
          <InvestigationTab incident={incident} onStart={() => setDialog("start")} />
        </TabsContent>
        <TabsContent value="actions">
          <ActionsTab incident={incident} onAdd={() => setDialog("action")} />
        </TabsContent>
        <TabsContent value="evidence">
          {incident.type.attachmentsAllowed ? (
            <EvidencePanel entityType="Incident" entityId={incident.id} readOnly={!p.addEvidence} />
          ) : (
            <EmptyState icon={FileSearch} title="No attachments for this type" description={`${incident.typeLabel} reports do not take attachments.`} />
          )}
        </TabsContent>
        <TabsContent value="comments">
          <CommentsPanel entityType="Incident" entityId={incident.id} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab incidentId={incident.id} />
        </TabsContent>
      </Tabs>

      <StartInvestigationDialog open={dialog === "start"} onOpenChange={(o) => setDialog(o ? "start" : null)} incident={incident} onStarted={() => setTab("investigation")} />
      <CloseDialog open={dialog === "close"} onOpenChange={(o) => setDialog(o ? "close" : null)} incident={incident} />
      <ReopenDialog open={dialog === "reopen"} onOpenChange={(o) => setDialog(o ? "reopen" : null)} incident={incident} />
      <ActionFormSheet
        open={dialog === "action"}
        onOpenChange={(o) => setDialog(o ? "action" : null)}
        config={{ mode: "create", incidentIds: [incident.id], departmentId: incident.placement.departmentId, title: `Add an action to ${incident.reference}` }}
        onSaved={() => setTab("actions")}
      />
    </>
  );
}

function primaryButton(
  step: IncidentNextStep | null,
  incident: IncidentDetailDto,
  on: Record<"submit" | "start" | "investigation" | "addAction" | "actions" | "close" | "reopen", () => void>,
): React.ReactNode {
  const p = incident.permissions;
  switch (step) {
    case "SUBMIT":
      return p.submit ? (
        <Button onClick={on.submit}>
          <Send /> {incident.submitBlockers.length ? "Complete and submit" : "Submit report"}
        </Button>
      ) : null;
    case "START_INVESTIGATION":
      return p.investigate ? (
        <Button onClick={on.start}>
          <Search /> Start investigation
        </Button>
      ) : null;
    case "COMPLETE_INVESTIGATION":
      return (
        <Button onClick={on.investigation}>
          <ClipboardCheck /> {p.investigate ? "Complete investigation" : "View investigation"}
        </Button>
      );
    case "ADD_ACTION":
      return p.raiseAction ? (
        <Button onClick={on.addAction}>
          <Plus /> Add action
        </Button>
      ) : null;
    case "TRACK_ACTIONS":
    case "REVIEW_ACTIONS":
    case "FOLLOW_UP":
      return (
        <Button onClick={on.actions}>
          <ListChecks /> {step === "FOLLOW_UP" ? "Follow up ineffective action" : step === "REVIEW_ACTIONS" ? "Review actions" : "Track actions"}
        </Button>
      );
    case "CLOSE":
      return p.close ? (
        <Button onClick={on.close}>
          <CheckCircle2 /> Close incident
        </Button>
      ) : null;
    case "REOPEN":
      return p.close ? (
        <Button variant="outline" onClick={on.reopen}>
          <RotateCcw /> Reopen
        </Button>
      ) : null;
    default:
      return null;
  }
}

function MoreMenu({ incident, onRun, onReopen }: { incident: IncidentDetailDto; onRun: (cmd: "archive" | "restore", msg: string) => void; onReopen: () => void }) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const p = incident.permissions;
  const items = [
    p.edit && !incident.closedAt && !incident.archivedAt ? (
      <DropdownMenuItem key="edit" asChild>
        <Link href={`/incidents/${incident.id}/edit`}>
          <Pencil /> Edit report
        </Link>
      </DropdownMenuItem>
    ) : null,
    p.close && incident.closedAt && incident.nextStep !== "REOPEN" ? (
      <DropdownMenuItem key="reopen" onSelect={onReopen}>
        <RotateCcw /> Reopen
      </DropdownMenuItem>
    ) : null,
    p.archive && !incident.archivedAt ? (
      <DropdownMenuItem key="archive" onSelect={() => setConfirmArchive(true)}>
        <Archive /> Archive
      </DropdownMenuItem>
    ) : null,
    p.archive && incident.archivedAt ? (
      <DropdownMenuItem key="restore" onSelect={() => onRun("restore", "Incident restored")}>
        <ArchiveRestore /> Restore
      </DropdownMenuItem>
    ) : null,
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="More actions">
            <MoreHorizontal /> <span className="sm:hidden">More</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{items}</DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archive ${incident.reference}?`}
        description="It disappears from the registers but nothing is deleted – you can restore it later. Linked actions stay as they are."
        confirmLabel="Archive"
        destructive
        onConfirm={() => onRun("archive", "Incident archived")}
      />
    </>
  );
}

function StartInvestigationDialog({ open, onOpenChange, incident, onStarted }: { open: boolean; onOpenChange: (o: boolean) => void; incident: IncidentDetailDto; onStarted: () => void }) {
  const types = useIncidentTypes(true);
  const type = types.data?.find((t) => t.id === incident.type.id);
  const [investigatorId, setInvestigatorId] = useState<string | null>(incident.investigators[0]?.id ?? null);
  const [formVersionId, setFormVersionId] = useState<string | null>(null);
  const start = useStartInvestigation(incident.id);
  const [blockers, setBlockers] = useState<string[]>([]);
  const chosen = formVersionId ?? type?.investigationForm?.versionId ?? null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start the investigation</DialogTitle>
          <DialogDescription>The investigation keeps the questions of the form chosen now, even if the form changes later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="s-investigator">Investigator</FieldLabel>
            <UserPicker id="s-investigator" value={investigatorId} onChange={setInvestigatorId} permission={PERMISSIONS.INCIDENT_INVESTIGATE} />
          </Field>
          <Field>
            <FieldLabel htmlFor="s-form">Investigation form</FieldLabel>
            <PublishedFormSelect id="s-form" module="incidents" purpose="INVESTIGATION" value={chosen} onChange={(f) => setFormVersionId(f?.versionId ?? null)} />
            <FieldDescription>Defaults to the form bound to {incident.typeLabel}.</FieldDescription>
          </Field>
          <BlockerList title="Cannot start yet" blockers={blockers} tone="destructive" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={start.isPending || !chosen}
            onClick={async () => {
              setBlockers([]);
              try {
                await start.mutateAsync({ investigatorId, formVersionId: chosen });
                toast.success("Investigation started");
                onOpenChange(false);
                onStarted();
              } catch (error) {
                setBlockers(blockersOf(error));
                toast.error(errorMessage(error));
              }
            }}
          >
            {start.isPending ? <Spinner /> : <Search />} Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ open, onOpenChange, incident }: { open: boolean; onOpenChange: (o: boolean) => void; incident: IncidentDetailDto }) {
  const [note, setNote] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const command = useIncidentCommand(incident.id);
  const ready = incident.closureBlockers.length === 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close {incident.reference}</DialogTitle>
          <DialogDescription>Closing is an explicit decision. It can be reopened later; the closure stays in the history.</DialogDescription>
        </DialogHeader>
        <BlockerList title="Still to do before closing" blockers={incident.closureBlockers} />
        <Field>
          <FieldLabel htmlFor="close-note">Closure note *</FieldLabel>
          <Textarea id="close-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. All corrective work verified" />
        </Field>
        <BlockerList title="Not closed" blockers={blockers} tone="destructive" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={command.isPending || !ready || !note.trim()}
            onClick={async () => {
              setBlockers([]);
              try {
                await command.mutateAsync({ command: "close", note, expectedVersion: incident.version });
                toast.success(`${incident.reference} closed`);
                onOpenChange(false);
              } catch (error) {
                setBlockers(blockersOf(error));
                toast.error(errorMessage(error));
              }
            }}
          >
            {command.isPending ? <Spinner /> : <CheckCircle2 />} Close incident
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenDialog({ open, onOpenChange, incident }: { open: boolean; onOpenChange: (o: boolean) => void; incident: IncidentDetailDto }) {
  const [reason, setReason] = useState("");
  const command = useIncidentCommand(incident.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen {incident.reference}</DialogTitle>
          <DialogDescription>Work can continue after reopening. The original closure note “{incident.closureNote}” stays in the history.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="reopen-reason">Why is it reopened?</FieldLabel>
          <Textarea id="reopen-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={command.isPending}
            onClick={async () => {
              try {
                await command.mutateAsync({ command: "reopen", reason: reason || undefined, expectedVersion: incident.version });
                toast.success(`${incident.reference} reopened`);
                onOpenChange(false);
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            {command.isPending ? <Spinner /> : <RotateCcw />} Reopen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
