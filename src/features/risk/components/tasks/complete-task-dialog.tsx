"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-client";
import { completionBlockers } from "@/server/modules/risk/workflow";
import { useCompleteTask, type TaskDetailDto } from "../../api";
import { blockersOf } from "../../format";
import { BlockerList } from "../shared";

/** Complete a task: comment + date between creation and today (+ achieved value for a scoring task). */
export function CompleteTaskDialog({ open, onOpenChange, task }: { open: boolean; onOpenChange: (o: boolean) => void; task: TaskDetailDto }) {
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(task.today);
  const [actual, setActual] = useState(task.targetValue === null ? "" : String(task.targetValue));
  const [blockers, setBlockers] = useState<string[]>([]);
  const complete = useCompleteTask(task.id);
  const actualValue = actual.trim() === "" ? null : Number(actual);
  const preview = completionBlockers({
    status: task.status,
    openSubTasks: task.openSubTasks,
    comment: "x",
    completedOn: task.today,
    createdOn: task.createdOn,
    today: task.today,
    scoring: task.scoring,
    assessmentStatus: task.assessmentStatus,
    actualValue: task.scoring ? 0 : null,
    factorRange: null,
  });

  async function submit() {
    setBlockers([]);
    try {
      const result = await complete.mutateAsync({ comment, completedOn: date, actualValue, expectedVersion: task.version });
      toast.success(result.rescored ? `Completed – assessment rescored to ${result.score} (revision ${result.revision})` : `${task.reference} completed`);
      onOpenChange(false);
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? "Someone else changed this task – reload to see their changes." : errorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete {task.reference}</DialogTitle>
          <DialogDescription>
            {task.scoring ? `Completing this task sets ${task.factorLabel?.toLowerCase()} on “${task.hazard?.name}” to the achieved value and rescores the assessment as a new revision.` : "The task owner stays the same; the completion is recorded in the history."}
          </DialogDescription>
        </DialogHeader>
        <BlockerList title="Still to do first" blockers={preview.filter((b) => !/comment|date|achieved/.test(b))} />
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="c-comment">Completion comment *</FieldLabel>
            <Textarea id="c-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Barrier installed and checked" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="c-date">Completed on *</FieldLabel>
              <Input id="c-date" type="date" min={task.createdOn} max={task.today} value={date} onChange={(e) => setDate(e.target.value)} />
              <FieldDescription>Between the creation date and today.</FieldDescription>
            </Field>
            {task.scoring && task.factorRange && (
              <Field>
                <FieldLabel htmlFor="c-actual">
                  Achieved {task.factorRange.label.toLowerCase()} ({task.factorRange.min}–{task.factorRange.max}) *
                </FieldLabel>
                <Input id="c-actual" type="number" min={task.factorRange.min} max={task.factorRange.max} step={1} value={actual} onChange={(e) => setActual(e.target.value)} />
                <FieldDescription>Was {task.originalValue ?? "—"}; intended {task.targetValue ?? "—"}.</FieldDescription>
              </Field>
            )}
          </div>
          <BlockerList title="Not completed" blockers={blockers} tone="destructive" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={complete.isPending || !comment.trim()} onClick={() => void submit()}>
            {complete.isPending ? <Spinner /> : <CheckCircle2 />} Complete task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
