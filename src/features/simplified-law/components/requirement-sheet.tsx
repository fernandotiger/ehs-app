"use client";

import { RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EvidencePanel } from "@/components/common/evidence-panel";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { UserPicker } from "@/components/common/user-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-client";
import { COMPLIANCE, COMPLIANCE_HINTS, COMPLIANCE_LABELS, SLAW_REQUIREMENT_ENTITY, type ComplianceKey } from "@/lib/simplified-law";
import { useAssessRequirement, useSlawSettings, type SlawRequirementDto } from "../api";
import { blockersOf, formatDate, STALE_MESSAGE, todayPlus } from "../format";
import { Blockers, ComplianceBadge } from "./shared";

const REASON_LABEL: Record<ComplianceKey, string> = {
  NOT_ASSESSED: "Notes (optional)",
  COMPLIANT: "Why are we compliant? (evidence) *",
  NOT_COMPLIANT: "What is the gap? (optional)",
  NOT_APPLICABLE: "Why does it not apply? (optional)",
};

const REASON_PLACEHOLDER: Record<ComplianceKey, string> = {
  NOT_ASSESSED: "",
  COMPLIANT: "e.g. Member of Repak since 2019 – certificate attached",
  NOT_COMPLIANT: "e.g. No data collected per material and country yet",
  NOT_APPLICABLE: "e.g. We do not use food-contact packaging",
};

/** Storyboard step 5, one row: compliant? reason, and if not: action, owner, due date. Evidence files/links below. */
export function RequirementSheet({ requirement, editable, onOpenChange }: { requirement: SlawRequirementDto | null; editable: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={Boolean(requirement)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{requirement && <RequirementForm key={requirement.id} r={requirement} editable={editable} onDone={() => onOpenChange(false)} />}</SheetContent>
    </Sheet>
  );
}

function RequirementForm({ r, editable, onDone }: { r: SlawRequirementDto; editable: boolean; onDone: () => void }) {
  const settings = useSlawSettings();
  const [compliance, setCompliance] = useState<ComplianceKey>(r.compliance);
  const [reason, setReason] = useState(r.reason);
  const [actionText, setActionText] = useState(r.action.text);
  const [ownerId, setOwnerId] = useState<string | null>(r.action.owner?.id ?? null);
  const [dueDate, setDueDate] = useState(r.action.dueDate ?? "");
  const [blockers, setBlockers] = useState<string[]>([]);
  const assess = useAssessRequirement();
  const done = r.action.status === "DONE";

  function choose(next: ComplianceKey) {
    setCompliance(next);
    // A new action after a done one starts empty; the first action gets the company's default due date.
    if (next === "NOT_COMPLIANT" && (done || !r.action.text) && !dueDate) setDueDate(todayPlus(settings.data?.defaultActionDays ?? 30));
  }

  function startNewAction() {
    setActionText("");
    setDueDate(todayPlus(settings.data?.defaultActionDays ?? 30));
  }

  async function submit() {
    setBlockers([]);
    try {
      await assess.mutateAsync({ id: r.id, expectedVersion: r.version, compliance, reason, actionText, actionOwnerId: ownerId, actionDueDate: dueDate || null });
      toast.success("Requirement saved");
      onDone();
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? STALE_MESSAGE : errorMessage(error));
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{editable ? "Check this requirement" : "Requirement"}</SheetTitle>
        <SheetDescription>
          {r.section ? `${r.section} · ` : ""}
          {r.articles || "No articles linked"}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4">
        <p className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed">{r.text}</p>

        {r.recheck && (
          <Alert>
            <RotateCcw className="size-4" />
            <AlertTitle>Action done – check again</AlertTitle>
            <AlertDescription>
              {r.action.completedBy?.name ?? "Someone"} finished the action on {formatDate(r.action.completedAt)}
              {r.action.note ? `: ${r.action.note}` : "."} If the gap is closed, mark it compliant.
            </AlertDescription>
          </Alert>
        )}

        {editable ? (
          <>
            <Field>
              <FieldLabel>Are we compliant?</FieldLabel>
              <RadioGroup value={compliance} onValueChange={(v) => choose(v as ComplianceKey)} className="grid gap-2 sm:grid-cols-2">
                {COMPLIANCE.map((c) => (
                  <FieldLabel key={c} className="flex items-start gap-3 rounded-lg border p-3 font-normal">
                    <RadioGroupItem value={c} className="mt-0.5" />
                    <FieldContent>
                      <span className="font-medium">{COMPLIANCE_LABELS[c]}</span>
                      <FieldDescription className="text-xs">{COMPLIANCE_HINTS[c]}</FieldDescription>
                    </FieldContent>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="slaw-req-reason">{REASON_LABEL[compliance]}</FieldLabel>
              <Textarea id="slaw-req-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={REASON_PLACEHOLDER[compliance]} />
            </Field>
            {compliance === "NOT_COMPLIANT" && (
              <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">If not: the action to take</p>
                  {done && actionText && (
                    <Button type="button" variant="ghost" size="sm" onClick={startNewAction}>
                      New action
                    </Button>
                  )}
                </div>
                {done && <p className="text-xs text-muted-foreground">The last action is done. Change it (or start a new one) to open a new action; keep it as it is to leave it done.</p>}
                <Field>
                  <FieldLabel htmlFor="slaw-action">Action *</FieldLabel>
                  <Textarea id="slaw-action" rows={2} value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="e.g. Complete the Repak EPR requirements" />
                </Field>
                <Field>
                  <FieldLabel>Owner *</FieldLabel>
                  <UserPicker value={ownerId} onChange={(id) => setOwnerId(id)} placeholder="Who will do it?" />
                  <FieldDescription>They are told and see it in My work.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="slaw-due">Due date *</FieldLabel>
                  <Input id="slaw-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </Field>
              </div>
            )}
            {compliance !== "NOT_COMPLIANT" && r.action.status === "OPEN" && (
              <p className="text-sm text-warning">The open action ({r.action.text}) is closed when you save.</p>
            )}
            <Blockers title="Not saved yet" blockers={blockers} />
          </>
        ) : (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Compliant?</dt>
              <dd className="mt-1">
                <ComplianceBadge compliance={r.compliance} />
              </dd>
            </div>
            {r.reason && (
              <div>
                <dt className="text-xs text-muted-foreground">Reason</dt>
                <dd className="whitespace-pre-wrap">{r.reason}</dd>
              </div>
            )}
            {r.action.status !== "NONE" && (
              <div>
                <dt className="text-xs text-muted-foreground">Action</dt>
                <dd>
                  {r.action.text} – {r.action.owner?.name ?? "no owner"}, due {formatDate(r.action.dueDate)} ({r.action.status === "OPEN" ? "open" : "done"})
                </dd>
              </div>
            )}
          </dl>
        )}

        {r.assessedBy && (
          <p className="text-xs text-muted-foreground">
            Last checked by {r.assessedBy.name} on {formatDate(r.assessedAt)}
          </p>
        )}
        <EvidencePanel entityType={SLAW_REQUIREMENT_ENTITY} entityId={r.id} readOnly={!editable} title="Evidence (files and links)" />
      </div>
      {editable && (
        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button disabled={assess.isPending} onClick={() => void submit()}>
            {assess.isPending ? <Spinner /> : <Save />} Save
          </Button>
        </SheetFooter>
      )}
    </>
  );
}
