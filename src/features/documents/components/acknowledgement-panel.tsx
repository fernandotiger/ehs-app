"use client";

import { BadgeCheck, CheckCircle2, Circle, CloudOff, Info, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { DocumentViewerDto } from "@/server/modules/documents/document.dto";
import { useAcknowledgeDocument } from "../api";
import { useMySurvey } from "../survey-api";
import { formatDateTime, relativeDue } from "../format";

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <span className={cn(done && "text-muted-foreground")}>{children}</span>
    </li>
  );
}

/**
 * Read-and-confirm flow: open the current version → tick the statement → confirm.
 * The confirm control stays disabled until the document has been opened (server enforces it too).
 */
export function AcknowledgementPanel({ doc, pendingSync, openedLocally }: { doc: DocumentViewerDto; pendingSync: boolean; openedLocally: boolean }) {
  const [checked, setChecked] = useState(false);
  const checkboxId = useId();
  const acknowledge = useAcknowledgeDocument(doc);
  const version = doc.currentVersion;
  // With a survey to answer the checklist becomes: 1 Open · 2 Confirm · 3 Answer survey.
  const survey = useMySurvey(doc.id).data?.survey;
  const surveyStep = survey && survey.assigned && (survey.status === "ACTIVE" || survey.answered) ? survey : null;

  if (!doc.requiresAcknowledgement || !doc.assigned) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-brand" />
          <p className="text-sm text-muted-foreground">
            {doc.requiresAcknowledgement ? "This document isn't assigned to you, so no acknowledgement is needed." : "For information – no acknowledgement is required."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (doc.ackStatus === "acknowledged" && doc.acknowledgement) {
    const receipt = doc.acknowledgement;
    return (
      <Card className="border-success/30 ring-success/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-success">
            <BadgeCheck className="size-5" /> Acknowledged
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="rounded-lg bg-success/10 p-3 italic">&ldquo;{receipt.statement}&rdquo;</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">Date &amp; time</dt>
            <dd className="font-medium">{formatDateTime(receipt.acknowledgedAt)}</dd>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-medium">Version {receipt.versionNumber}</dd>
            {receipt.source === "OFFLINE_SYNC" && (
              <>
                <dt className="text-muted-foreground">Confirmed offline</dt>
                <dd className="font-medium">{formatDateTime(receipt.clientAcknowledgedAt)}</dd>
              </>
            )}
          </dl>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Recorded in the tamper-evident audit trail.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (pendingSync) {
    return (
      <Alert className="border-info/40 bg-info/10">
        <CloudOff />
        <AlertTitle>Acknowledgement pending sync</AlertTitle>
        <AlertDescription>Your confirmation is saved on this device. It will be recorded when you&apos;re back online and press Sync.</AlertDescription>
      </Alert>
    );
  }

  const opened = doc.openedCurrentVersion || openedLocally;
  const due = relativeDue(doc.dueAt);
  const reack = (doc.requiredVersionNumber ?? 1) > 1;

  async function confirm() {
    if (!version) return;
    try {
      const outcome = await acknowledge.mutateAsync(version.id);
      if (outcome.queued) toast.info("You're offline – your acknowledgement will be sent when you sync.");
      else toast.success("Thank you – your acknowledgement has been recorded.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card className={cn(doc.ackStatus === "overdue" ? "ring-destructive/40" : "ring-warning/40")}>
      <CardHeader>
        <CardTitle>Acknowledgement required</CardTitle>
        <p className={cn("text-sm", doc.ackStatus === "overdue" ? "font-medium text-destructive" : "text-muted-foreground")}>
          {reack ? `Version ${doc.requiredVersionNumber} has changed – please read it again. ` : ""}
          {due ?? ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2">
          <Step done={opened}>Open and read the document</Step>
          <Step done={checked}>Confirm you have read and understood it</Step>
          {surveyStep && <Step done={Boolean(surveyStep.answered)}>Answer the survey{surveyStep.isMandatory ? "" : " (optional)"}</Step>}
        </ol>

        <label
          htmlFor={checkboxId}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
            checked ? "border-brand bg-brand-soft/60" : "hover:bg-muted/50",
            !opened && "cursor-not-allowed opacity-60",
          )}
        >
          <Checkbox id={checkboxId} className="mt-0.5 size-5" checked={checked} disabled={!opened || acknowledge.isPending} onCheckedChange={(v) => setChecked(v === true)} />
          <span className="text-sm font-medium leading-snug">{doc.statement}</span>
        </label>

        {!opened && <p className="text-xs text-muted-foreground">Open the document first – the confirmation becomes available once you have opened it.</p>}

        <Button size="lg" className="h-11 w-full" disabled={!opened || !checked || acknowledge.isPending} onClick={confirm}>
          {acknowledge.isPending ? <Spinner /> : <BadgeCheck />} Acknowledge
        </Button>
      </CardContent>
    </Card>
  );
}
