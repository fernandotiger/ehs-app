"use client";

import { Ban, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { BlockerList } from "@/features/incidents/components/shared";
import { errorMessage } from "@/lib/api-client";
import { useCancelAction, useCompleteAction, type ActionDetailDto } from "../api";
import { blockersOf } from "../format";

const STALE = "Someone else changed this action – reload to see their changes.";

/** Complete: what was done + the date (between creation and today). The owner stays the same. */
export function CompleteActionDialog({ open, onOpenChange, action }: { open: boolean; onOpenChange: (o: boolean) => void; action: ActionDetailDto }) {
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(action.today);
  const [blockers, setBlockers] = useState<string[]>([]);
  const complete = useCompleteAction(action.id);

  async function submit() {
    setBlockers([]);
    try {
      await complete.mutateAsync({ notes, completedOn: date, expectedVersion: action.version });
      toast.success(`${action.reference} completed`);
      onOpenChange(false);
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? STALE : errorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete {action.reference}</DialogTitle>
          <DialogDescription>{action.assignedToMe ? "Say what you did – the person who asked for it is told." : `You are completing this for ${action.owner.name}; they stay the owner.`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="ac-notes">What was done? *</FieldLabel>
            <Textarea id="ac-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Step replaced and ladder checked" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ac-done">Done on *</FieldLabel>
            <Input id="ac-done" type="date" min={action.createdOn} max={action.today} value={date} onChange={(e) => setDate(e.target.value)} />
            <FieldDescription>Between the day the action was created and today.</FieldDescription>
          </Field>
          <BlockerList title="Not completed" blockers={blockers} tone="destructive" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={complete.isPending || !notes.trim()} onClick={() => void submit()}>
            {complete.isPending ? <Spinner /> : <CheckCircle2 />} Complete action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cancel with a reason; it can be reopened later. */
export function CancelActionDialog({ open, onOpenChange, action }: { open: boolean; onOpenChange: (o: boolean) => void; action: ActionDetailDto }) {
  const [reason, setReason] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const cancel = useCancelAction(action.id);

  async function submit() {
    setBlockers([]);
    try {
      await cancel.mutateAsync({ reason, expectedVersion: action.version });
      toast.success(`${action.reference} cancelled`);
      onOpenChange(false);
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? STALE : errorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {action.reference}?</DialogTitle>
          <DialogDescription>Use this when the action is no longer needed. {action.assignedToMe ? "" : `${action.owner.name} is told.`} It can be reopened later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="ac-reason">Why is it cancelled? *</FieldLabel>
            <Textarea id="ac-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate of AC-2026-0004" />
          </Field>
          <BlockerList title="Not cancelled" blockers={blockers} tone="destructive" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep the action
          </Button>
          <Button variant="destructive" disabled={cancel.isPending || !reason.trim()} onClick={() => void submit()}>
            {cancel.isPending ? <Spinner /> : <Ban />} Cancel action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
