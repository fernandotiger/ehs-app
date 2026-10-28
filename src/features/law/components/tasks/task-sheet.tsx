"use client";

import { CheckCircle2, Plus, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { UserPicker } from "@/components/common/user-picker";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { BlockerList } from "@/features/incidents/components/shared";
import { enumOptions, SimpleSelect } from "@/features/incidents/components/fields";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { LAW_TASK_PRIORITIES, LAW_TASK_PRIORITY_LABELS, type LawTaskPriorityKey } from "@/lib/law";
import { errorMessage } from "@/lib/api-client";
import { taskSaveBlockers } from "@/server/modules/law/workflow";
import { useCompleteLawTask, useCreateLawTask, useUpdateLawTask, type LawTaskDetailDto } from "../../api";
import { addDaysLocal, blockersOf, todayLocal } from "../../format";
import { SiteDepartmentSelect, useDefaultDepartment } from "../requirements/requirement-dialogs";

interface Values {
  title: string;
  details: string;
  ownerId: string | null;
  departmentId: string | null;
  dueDate: string;
  priority: LawTaskPriorityKey;
}

/** Add a task to a requirement, or edit an open task. */
export function LawTaskSheet({
  open,
  onOpenChange,
  requirement,
  task,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** New task: the requirement it belongs to. */
  requirement?: { id: string; reference: string; title: string; siteId: string | null; departmentId: string | null };
  task?: LawTaskDetailDto;
  onCreated?: (id: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {open && <TaskForm requirement={requirement} task={task} onDone={() => onOpenChange(false)} onCreated={onCreated} />}
      </SheetContent>
    </Sheet>
  );
}

function TaskForm({ requirement, task, onDone, onCreated }: { requirement?: { id: string; reference: string; title: string; siteId: string | null; departmentId: string | null }; task?: LawTaskDetailDto; onDone: () => void; onCreated?: (id: string) => void }) {
  const { user } = useCurrentUser();
  const siteId = task?.siteId ?? requirement?.siteId ?? null;
  const defaultDepartment = useDefaultDepartment(siteId);
  const [start] = useState<Values>(() => ({
    title: task?.title ?? "",
    details: task?.details ?? "",
    ownerId: task?.owner.id ?? user?.id ?? null,
    departmentId: task?.departmentId ?? requirement?.departmentId ?? defaultDepartment,
    dueDate: task?.dueDate ?? addDaysLocal(todayLocal(), 14),
    priority: task?.priority ?? "MEDIUM",
  }));
  const [v, setV] = useState<Values>(start);
  const [showErrors, setShowErrors] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const create = useCreateLawTask();
  const update = useUpdateLawTask(task?.id ?? "");
  const guard = useUnsavedChangesGuard(JSON.stringify(v) !== JSON.stringify(start));
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const errors = taskSaveBlockers({ ...v, today: todayLocal(), currentDueDate: task?.dueDate ?? null });
  const err = (word: string) => (showErrors ? errors.find((e) => e.includes(word)) : undefined);
  const pending = create.isPending || update.isPending;

  async function save() {
    setBlockers([]);
    if (errors.length) {
      setShowErrors(true);
      toast.error(errors[0]!);
      return;
    }
    const body = { title: v.title.trim(), details: v.details.trim(), ownerId: v.ownerId, departmentId: v.departmentId, dueDate: v.dueDate, priority: v.priority };
    try {
      if (task) {
        await update.mutateAsync({ ...body, expectedVersion: task.version });
        toast.success("Task saved");
      } else {
        const res = await create.mutateAsync({ ...body, requirementId: requirement!.id });
        toast.success(`Task ${res.reference} added`);
        onCreated?.(res.id);
      }
      onDone();
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      setBlockers(blockersOf(error));
      toast.error(errorMessage(error), { action: { label: "Retry", onClick: () => void save() } });
    }
  }

  return (
    <>
      {guard.dialog}
      <SheetHeader>
        <SheetTitle>{task ? `Edit ${task.reference}` : "Add a task"}</SheetTitle>
        <SheetDescription>{task ? "Changing who does it sends them a notification." : `Work needed for ${requirement?.reference} · ${requirement?.title}. The person you choose is notified.`}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        {stale && <StaleVersionAlert draft={v} draftName="task" onReload={() => window.location.reload()} />}
        <Field data-invalid={err("task") ? true : undefined}>
          <FieldLabel htmlFor="lt-title">What needs to be done? *</FieldLabel>
          <Input id="lt-title" value={v.title} maxLength={200} autoFocus onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Inspect route barriers" />
          {err("task") && <FieldError>{err("task")}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="lt-details">Details</FieldLabel>
          <Textarea id="lt-details" rows={3} value={v.details} onChange={(e) => set({ details: e.target.value })} placeholder="Anything that helps get it done (optional)" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={err("who") ? true : undefined}>
            <FieldLabel htmlFor="lt-owner">Who will do it? *</FieldLabel>
            <UserPicker id="lt-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} allowClear={false} placeholder="Choose a person" />
            {err("who") && <FieldError>{err("who")}</FieldError>}
          </Field>
          <Field data-invalid={err("due date") ? true : undefined}>
            <FieldLabel htmlFor="lt-due">Due date *</FieldLabel>
            <Input id="lt-due" type="date" value={v.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
            {err("due date") && <FieldError>{err("due date")}</FieldError>}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={err("department") ? true : undefined}>
            <FieldLabel htmlFor="lt-dept">Department *</FieldLabel>
            <SiteDepartmentSelect id="lt-dept" siteId={siteId} value={v.departmentId} onChange={(id) => set({ departmentId: id })} invalid={Boolean(err("department"))} />
            {err("department") && <FieldError>{err("department")}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="lt-priority">Priority</FieldLabel>
            <SimpleSelect id="lt-priority" value={v.priority} onChange={(x) => set({ priority: (x ?? "MEDIUM") as LawTaskPriorityKey })} options={enumOptions(LAW_TASK_PRIORITIES, LAW_TASK_PRIORITY_LABELS)} />
          </Field>
        </div>
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => guard.confirm(onDone)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={pending}>
            {pending ? <Spinner /> : task ? <Save /> : <Plus />} {task ? "Save" : "Add task"}
          </Button>
        </div>
      </div>
    </>
  );
}

/** Done – with the required completion comment. */
export function CompleteLawTaskDialog({ task, open, onOpenChange }: { task: LawTaskDetailDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [notes, setNotes] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const complete = useCompleteLawTask(task.id);
  async function save() {
    if (!notes.trim()) {
      setShowErrors(true);
      return;
    }
    try {
      await complete.mutateAsync({ notes: notes.trim(), expectedVersion: task.version });
      toast.success(`${task.reference} is done`);
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
          <DialogTitle>Mark the task as done</DialogTitle>
          <DialogDescription>Say what was done. Finishing a task does not change the compliance check – update the requirement yourself if the situation changed.</DialogDescription>
        </DialogHeader>
        <Field data-invalid={(showErrors && !notes.trim()) || undefined}>
          <FieldLabel htmlFor="lt-notes">What was done? *</FieldLabel>
          <Textarea id="lt-notes" rows={3} autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Barriers inspected; one defect raised as an action" />
          {showErrors && !notes.trim() ? <FieldError>Say what was done (completion comment).</FieldError> : <FieldDescription>Kept in the task history.</FieldDescription>}
        </Field>
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={complete.isPending}>
            {complete.isPending ? <Spinner /> : <CheckCircle2 />} Mark as done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
