"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { UserPicker } from "@/components/common/user-picker";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { ACTION_KIND_LABELS, ACTION_KINDS, PRIORITIES, PRIORITY_LABELS, type ActionKindKey, type PriorityKey } from "@/lib/incidents";
import { PERMISSIONS } from "@/lib/permissions";
import { useCreateAction, useFollowUp, useUpdateAction, type ActionDetailDto } from "../../api";
import { addDaysLocal, blockersOf, todayLocal } from "../../format";
import { DepartmentSelect, enumOptions, LookupLabelSelect, SimpleSelect } from "../fields";
import { BlockerList } from "../shared";

export type ActionSheetMode =
  | { mode: "create"; incidentIds: string[]; departmentId?: string | null; kind?: ActionKindKey; title?: string }
  | { mode: "edit"; action: ActionDetailDto }
  | { mode: "follow-up"; action: ActionDetailDto };

interface Values {
  description: string;
  kind: ActionKindKey;
  ownerId: string | null;
  departmentId: string | null;
  dueDate: string;
  priority: PriorityKey;
  capaCategory: string | null;
  reviewerId: string | null;
  plannedReviewDate: string;
}

function initial(m: ActionSheetMode): Values {
  if (m.mode === "edit") {
    const a = m.action;
    return {
      description: a.description,
      kind: a.kind,
      ownerId: a.owner.id,
      departmentId: a.placement.departmentId,
      dueDate: a.dueDate,
      priority: a.priority,
      capaCategory: a.capaCategory,
      reviewerId: a.reviewer?.id ?? null,
      plannedReviewDate: a.plannedReviewDate ?? "",
    };
  }
  const due = addDaysLocal(todayLocal(), 14);
  return {
    description: "",
    kind: m.mode === "create" ? (m.kind ?? "CORRECTIVE") : m.action.kind,
    ownerId: null,
    departmentId: m.mode === "create" ? (m.departmentId ?? null) : m.action.placement.departmentId,
    dueDate: due,
    priority: m.mode === "follow-up" ? "HIGH" : "NORMAL",
    capaCategory: m.mode === "follow-up" ? m.action.capaCategory : null,
    reviewerId: m.mode === "follow-up" ? (m.action.reviewer?.id ?? null) : null,
    plannedReviewDate: addDaysLocal(due, 30),
  };
}

/** Create / edit / follow-up for a corrective or preventive action (short form in a Sheet). */
export function ActionFormSheet({ open, onOpenChange, config, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; config: ActionSheetMode; onSaved?: (id: string) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{open && <ActionForm config={config} onDone={(id) => { onOpenChange(false); if (id) onSaved?.(id); }} />}</SheetContent>
    </Sheet>
  );
}

function ActionForm({ config, onDone }: { config: ActionSheetMode; onDone: (id?: string) => void }) {
  const { can } = useCurrentUser();
  const [start] = useState(() => initial(config));
  const [v, setV] = useState<Values>(start);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const create = useCreateAction();
  const update = useUpdateAction(config.mode === "create" ? "" : config.action.id);
  const followUp = useFollowUp(config.mode === "create" ? "" : config.action.id);
  const dirty = JSON.stringify(v) !== JSON.stringify(start);
  const guard = useUnsavedChangesGuard(dirty);
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const busy = create.isPending || update.isPending || followUp.isPending;
  const canAssign = can(PERMISSIONS.INCIDENT_ACTION_ASSIGN) || config.mode !== "edit";

  const title = config.mode === "edit" ? `Edit ${config.action.reference}` : config.mode === "follow-up" ? `Follow-up for ${config.action.reference}` : (config.title ?? "Add an action");
  const description =
    config.mode === "follow-up"
      ? "The follow-up keeps every incident and the origin of the ineffective action."
      : config.mode === "edit"
        ? "Changing the plan keeps every completion and review rule."
        : "Who does what, by when – and who checks that it worked.";

  async function save() {
    setBlockers([]);
    if (!v.description.trim() || !v.ownerId || !v.dueDate) {
      setShowErrors(true);
      toast.error("Enter a description, an owner and a due date.");
      return;
    }
    const base = {
      description: v.description.trim(),
      ownerId: v.ownerId,
      departmentId: v.departmentId,
      dueDate: v.dueDate,
      priority: v.priority,
      capaCategory: v.capaCategory,
      reviewerId: v.reviewerId,
      plannedReviewDate: v.plannedReviewDate || null,
    };
    try {
      if (config.mode === "create") {
        const res = await create.mutateAsync({ ...base, kind: v.kind, incidentIds: config.incidentIds });
        toast.success(`Action ${res.reference} created`);
        onDone(res.id);
      } else if (config.mode === "edit") {
        await update.mutateAsync({ ...base, expectedVersion: config.action.version });
        toast.success("Action updated");
        onDone(config.action.id);
      } else {
        const res = await followUp.mutateAsync(base);
        toast.success(`Follow-up ${res.reference} created`);
        onDone(res.id);
      }
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      setBlockers(blockersOf(error));
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      {guard.dialog}
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        {stale && config.mode === "edit" && <StaleVersionAlert draft={v} draftName="action" onReload={() => window.location.reload()} />}
        <Field data-invalid={(showErrors && !v.description.trim()) || undefined}>
          <FieldLabel htmlFor="a-desc">What needs to be done? *</FieldLabel>
          <Textarea id="a-desc" rows={3} value={v.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Replace the defective ladder" />
        </Field>
        {config.mode === "create" && (
          <Field>
            <FieldLabel htmlFor="a-kind">Kind</FieldLabel>
            <SimpleSelect id="a-kind" value={v.kind} onChange={(x) => set({ kind: (x ?? "CORRECTIVE") as ActionKindKey })} options={enumOptions(ACTION_KINDS, ACTION_KIND_LABELS)} />
            <FieldDescription>Corrective fixes the cause of this event; preventive stops similar events.</FieldDescription>
          </Field>
        )}
        <Field data-invalid={(showErrors && !v.ownerId) || undefined}>
          <FieldLabel htmlFor="a-owner">Owner *</FieldLabel>
          <UserPicker id="a-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} disabled={!canAssign} placeholder="Who will do it?" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="a-due">Due date *</FieldLabel>
            <Input id="a-due" type="date" value={v.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="a-priority">Priority</FieldLabel>
            <SimpleSelect id="a-priority" value={v.priority} onChange={(x) => set({ priority: (x ?? "NORMAL") as PriorityKey })} options={enumOptions(PRIORITIES, PRIORITY_LABELS)} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="a-dept">Department</FieldLabel>
          <DepartmentSelect id="a-dept" value={v.departmentId} onChange={(x) => set({ departmentId: x })} allowNone noneLabel="Same as the incident" />
        </Field>
        <Field>
          <FieldLabel htmlFor="a-cat">Category</FieldLabel>
          <LookupLabelSelect id="a-cat" listKey="incident.capa-category" value={v.capaCategory} onChange={(x) => set({ capaCategory: x })} allowNone noneLabel="Not specified" />
        </Field>
        <div className="space-y-3 rounded-xl border p-3">
          <p className="text-sm font-medium">Effectiveness check</p>
          <Field>
            <FieldLabel htmlFor="a-reviewer">Reviewer</FieldLabel>
            <UserPicker id="a-reviewer" value={v.reviewerId} onChange={(id) => set({ reviewerId: id })} permission={PERMISSIONS.INCIDENT_ACTION_VERIFY} placeholder="Who checks it worked?" />
          </Field>
          <Field>
            <FieldLabel htmlFor="a-review">Planned review date</FieldLabel>
            <Input id="a-review" type="date" value={v.plannedReviewDate} onChange={(e) => set({ plannedReviewDate: e.target.value })} />
            <FieldDescription>Effectiveness can be recorded on or after this date. Both are needed before the action can be completed.</FieldDescription>
          </Field>
        </div>
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => guard.confirm(() => onDone())}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner /> : <Save />} {config.mode === "edit" ? "Save changes" : "Create action"}
          </Button>
        </div>
      </div>
    </>
  );
}
