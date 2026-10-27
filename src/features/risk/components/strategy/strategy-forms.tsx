"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { UserPicker } from "@/components/common/user-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { DepartmentSelect, enumOptions, LookupLabelSelect, SimpleSelect } from "@/features/incidents/components/fields";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { PROGRAMME_STATUS_LABELS, PROGRAMME_STATUSES, STRATEGY_STATUS_LABELS, STRATEGY_STATUSES, TARGET_DIRECTION_LABELS, TARGET_DIRECTIONS, type ProgrammeStatus, type StrategyStatus, type TargetDirection } from "@/lib/risk/labels";
import { objectiveBlockers, programmeBlockers, targetBlockers, targetProgress } from "@/server/modules/risk/strategy";
import { useObjective, useObjectives, useSaveStrategy, type ObjectiveDto, type ProgrammeDto, type TargetDto } from "../../api";
import { addDaysLocal, blockersOf, todayLocal } from "../../format";
import { BlockerList, ProgressBar } from "../shared";

export type StrategySheet =
  | { kind: "objective"; record?: ObjectiveDto }
  | { kind: "target"; record?: TargetDto; objectiveId?: string }
  | { kind: "programme"; record?: ProgrammeDto; objectiveId?: string };

/** Create / edit objectives, targets and programmes (short forms in a Sheet). */
export function StrategyFormSheet({ sheet, onClose, onSaved }: { sheet: StrategySheet | null; onClose: () => void; onSaved?: (kind: StrategySheet["kind"], id: string) => void }) {
  return (
    <Sheet open={Boolean(sheet)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {sheet?.kind === "objective" && <ObjectiveForm record={sheet.record} onDone={(id) => { onClose(); if (id) onSaved?.("objective", id); }} />}
        {sheet?.kind === "target" && <TargetForm record={sheet.record} objectiveId={sheet.objectiveId} onDone={(id) => { onClose(); if (id) onSaved?.("target", id); }} />}
        {sheet?.kind === "programme" && <ProgrammeForm record={sheet.record} objectiveId={sheet.objectiveId} onDone={(id) => { onClose(); if (id) onSaved?.("programme", id); }} />}
      </SheetContent>
    </Sheet>
  );
}

function Footer({ busy, onCancel, onSave, label }: { busy: boolean; onCancel: () => void; onSave: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" onClick={onSave} disabled={busy}>
        {busy ? <Spinner /> : <Save />} {label}
      </Button>
    </div>
  );
}

function useObjectiveOptions() {
  const list = useObjectives({ page: 1, pageSize: 100 });
  return (list.data?.items ?? []).map((o) => ({ value: o.id, label: o.title }));
}

function ObjectiveForm({ record, onDone }: { record?: ObjectiveDto; onDone: (id?: string) => void }) {
  const [start] = useState(() => ({
    title: record?.title ?? "",
    domain: record?.domain ?? null,
    departmentId: record?.placement.departmentId ?? null,
    ownerId: record?.owner.id ?? null,
    deadline: record?.deadline ?? addDaysLocal(todayLocal(), 365),
    description: record?.description ?? "",
    status: (record?.status ?? "ACTIVE") as StrategyStatus,
  }));
  const [v, setV] = useState(start);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const save = useSaveStrategy("objectives");
  const guard = useUnsavedChangesGuard(JSON.stringify(v) !== JSON.stringify(start));
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  async function submit() {
    const local = objectiveBlockers({ title: v.title, ownerId: v.ownerId, deadline: v.deadline || null, departmentId: v.departmentId });
    setBlockers(local);
    if (local.length) return;
    try {
      const res = await save.mutateAsync({ ...v, title: v.title.trim(), description: v.description.trim() || null, id: record?.id, expectedVersion: record?.version });
      toast.success(record ? "Objective updated" : "Objective created");
      onDone(res.id);
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
        <SheetTitle>{record ? "Edit objective" : "New objective"}</SheetTitle>
        <SheetDescription>The outcome or policy commitment the targets and programmes work towards.</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        {stale && <StaleVersionAlert draft={v} draftName="objective" onReload={() => window.location.reload()} />}
        <Field>
          <FieldLabel htmlFor="o-title">Title *</FieldLabel>
          <Input id="o-title" value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Reduce transport exposure" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="o-domain">Domain</FieldLabel>
            <LookupLabelSelect id="o-domain" listKey="risk.objective-domain" value={v.domain} onChange={(x) => set({ domain: x })} allowNone noneLabel="Not specified" />
          </Field>
          <Field>
            <FieldLabel htmlFor="o-dept">Department *</FieldLabel>
            <DepartmentSelect id="o-dept" value={v.departmentId} onChange={(x) => set({ departmentId: x })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="o-owner">Owner *</FieldLabel>
            <UserPicker id="o-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="o-deadline">Deadline *</FieldLabel>
            <Input id="o-deadline" type="date" value={v.deadline} onChange={(e) => set({ deadline: e.target.value })} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="o-desc">Desired outcome / policy commitment</FieldLabel>
          <Textarea id="o-desc" rows={3} value={v.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        {record && (
          <Field>
            <FieldLabel htmlFor="o-status">Status</FieldLabel>
            <SimpleSelect id="o-status" value={v.status} onChange={(x) => set({ status: (x ?? "ACTIVE") as StrategyStatus })} options={enumOptions(STRATEGY_STATUSES, STRATEGY_STATUS_LABELS)} />
            <FieldDescription>Completing an objective is your decision – it is not set automatically from its targets.</FieldDescription>
          </Field>
        )}
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <Footer busy={save.isPending} onCancel={() => guard.confirm(() => onDone())} onSave={() => void submit()} label={record ? "Save changes" : "Create objective"} />
      </div>
    </>
  );
}

function TargetForm({ record, objectiveId, onDone }: { record?: TargetDto; objectiveId?: string; onDone: (id?: string) => void }) {
  const objectives = useObjectiveOptions();
  const [start] = useState(() => ({
    objectiveId: record?.objective.id ?? objectiveId ?? null,
    title: record?.title ?? "",
    ownerId: record?.owner.id ?? null,
    deadline: record?.deadline ?? addDaysLocal(todayLocal(), 180),
    direction: (record?.direction ?? "DECREASE") as TargetDirection,
    unit: record?.unit ?? null,
    baseline: record ? String(record.baseline) : "",
    current: record ? String(record.current) : "",
    goal: record ? String(record.goal) : "",
    status: (record?.status ?? "ACTIVE") as StrategyStatus,
  }));
  const [v, setV] = useState(start);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const save = useSaveStrategy("targets");
  const guard = useUnsavedChangesGuard(JSON.stringify(v) !== JSON.stringify(start));
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
  const numbers = { direction: v.direction, baseline: num(v.baseline), current: num(v.current), goal: num(v.goal) };
  const valid = [numbers.baseline, numbers.current, numbers.goal].every(Number.isFinite);
  async function submit() {
    const local = targetBlockers({ ...numbers, title: v.title, objectiveId: v.objectiveId, ownerId: v.ownerId, deadline: v.deadline || null, unit: v.unit, status: v.status });
    setBlockers(local);
    if (local.length) return;
    try {
      const res = await save.mutateAsync({ ...v, ...numbers, title: v.title.trim(), id: record?.id, expectedVersion: record?.version });
      toast.success(record ? "Target updated" : "Target created");
      onDone(res.id);
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
        <SheetTitle>{record ? "Edit target" : "New target"}</SheetTitle>
        <SheetDescription>A measurable step towards an objective: from a baseline to a goal.</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        {stale && <StaleVersionAlert draft={v} draftName="target" onReload={() => window.location.reload()} />}
        <Field>
          <FieldLabel htmlFor="t-obj">Objective *</FieldLabel>
          <SimpleSelect id="t-obj" value={v.objectiveId} onChange={(x) => set({ objectiveId: x })} options={objectives} placeholder="Choose an objective…" />
        </Field>
        <Field>
          <FieldLabel htmlFor="t-title">Title *</FieldLabel>
          <Input id="t-title" value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Unsafe observations on transport routes" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="t-owner">Owner *</FieldLabel>
            <UserPicker id="t-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-deadline">Deadline *</FieldLabel>
            <Input id="t-deadline" type="date" value={v.deadline} onChange={(e) => set({ deadline: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-dir">Direction *</FieldLabel>
            <SimpleSelect id="t-dir" value={v.direction} onChange={(x) => set({ direction: (x ?? "DECREASE") as TargetDirection })} options={enumOptions(TARGET_DIRECTIONS, TARGET_DIRECTION_LABELS)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-unit">Unit *</FieldLabel>
            <LookupLabelSelect id="t-unit" listKey="risk.target-unit" value={v.unit} onChange={(x) => set({ unit: x })} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field>
            <FieldLabel htmlFor="t-base">Baseline *</FieldLabel>
            <Input id="t-base" type="number" value={v.baseline} onChange={(e) => set({ baseline: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-current">Current *</FieldLabel>
            <Input id="t-current" type="number" value={v.current} onChange={(e) => set({ current: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-goal">Goal *</FieldLabel>
            <Input id="t-goal" type="number" value={v.goal} onChange={(e) => set({ goal: e.target.value })} />
          </Field>
        </div>
        {valid && <ProgressBar value={targetProgress(numbers)} label="Progress towards the goal" />}
        {record && (
          <Field>
            <FieldLabel htmlFor="t-status">Status</FieldLabel>
            <SimpleSelect id="t-status" value={v.status} onChange={(x) => set({ status: (x ?? "ACTIVE") as StrategyStatus })} options={enumOptions(STRATEGY_STATUSES, STRATEGY_STATUS_LABELS)} />
            <FieldDescription>A target can be completed once the current measurement reaches the goal.</FieldDescription>
          </Field>
        )}
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <Footer busy={save.isPending} onCancel={() => guard.confirm(() => onDone())} onSave={() => void submit()} label={record ? "Save changes" : "Create target"} />
      </div>
    </>
  );
}

function ProgrammeForm({ record, objectiveId, onDone }: { record?: ProgrammeDto; objectiveId?: string; onDone: (id?: string) => void }) {
  const objectives = useObjectiveOptions();
  const [start] = useState(() => ({
    objectiveId: record?.objective.id ?? objectiveId ?? null,
    title: record?.title ?? "",
    targetIds: record?.targets.map((t) => t.id) ?? [],
    departmentId: record?.placement.departmentId ?? null,
    ownerId: record?.owner.id ?? null,
    startDate: record?.startDate ?? todayLocal(),
    deadline: record?.deadline ?? addDaysLocal(todayLocal(), 90),
    means: record?.means ?? "",
    budget: record?.budget === null || record?.budget === undefined ? "" : String(record.budget),
    status: (record?.status ?? "PLANNED") as ProgrammeStatus,
  }));
  const [v, setV] = useState(start);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const save = useSaveStrategy("programmes");
  const objective = useObjective(v.objectiveId);
  const targets = v.objectiveId ? (objective.data?.targets ?? []) : [];
  const guard = useUnsavedChangesGuard(JSON.stringify(v) !== JSON.stringify(start));
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  async function submit() {
    const budget = v.budget.trim() === "" ? null : Number(v.budget);
    const local = programmeBlockers({
      title: v.title,
      objectiveId: v.objectiveId,
      targetIds: v.targetIds,
      objectiveTargetIds: targets.map((t) => t.id),
      departmentId: v.departmentId,
      ownerId: v.ownerId,
      startDate: v.startDate || null,
      deadline: v.deadline || null,
      budget,
      status: "ACTIVE",
      taskStatuses: [],
    });
    setBlockers(local);
    if (local.length) return;
    try {
      const res = await save.mutateAsync({ ...v, budget, title: v.title.trim(), means: v.means.trim() || null, id: record?.id, expectedVersion: record?.version });
      toast.success(record ? "Programme updated" : "Programme created");
      onDone(res.id);
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
        <SheetTitle>{record ? "Edit programme" : "New management programme"}</SheetTitle>
        <SheetDescription>The planned work, means and budget that move one or more targets.</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        {stale && <StaleVersionAlert draft={v} draftName="programme" onReload={() => window.location.reload()} />}
        <Field>
          <FieldLabel htmlFor="p-obj">Objective *</FieldLabel>
          <SimpleSelect id="p-obj" value={v.objectiveId} onChange={(x) => set({ objectiveId: x, targetIds: [] })} options={objectives} placeholder="Choose an objective…" />
        </Field>
        <Field>
          <FieldLabel>Linked targets *</FieldLabel>
          {!v.objectiveId ? (
            <p className="text-sm text-muted-foreground">Choose the objective first.</p>
          ) : targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">This objective has no targets yet – add one first.</p>
          ) : (
            <ul className="space-y-1.5">
              {targets.map((t) => (
                <li key={t.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={v.targetIds.includes(t.id)} onCheckedChange={(c) => set({ targetIds: c === true ? [...v.targetIds, t.id] : v.targetIds.filter((x) => x !== t.id) })} />
                    {t.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="p-title">Title *</FieldLabel>
          <Input id="p-title" value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Install segregation" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="p-dept">Department *</FieldLabel>
            <DepartmentSelect id="p-dept" value={v.departmentId} onChange={(x) => set({ departmentId: x })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-owner">Owner *</FieldLabel>
            <UserPicker id="p-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-start">Start *</FieldLabel>
            <Input id="p-start" type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-deadline">Deadline *</FieldLabel>
            <Input id="p-deadline" type="date" min={v.startDate} value={v.deadline} onChange={(e) => set({ deadline: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-budget">Budget (€)</FieldLabel>
            <Input id="p-budget" type="number" min={0} value={v.budget} onChange={(e) => set({ budget: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-status">Status</FieldLabel>
            <SimpleSelect id="p-status" value={v.status} onChange={(x) => set({ status: (x ?? "PLANNED") as ProgrammeStatus })} options={enumOptions(PROGRAMME_STATUSES, PROGRAMME_STATUS_LABELS)} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="p-means">Means, resources and scope</FieldLabel>
          <Textarea id="p-means" rows={3} value={v.means} onChange={(e) => set({ means: e.target.value })} />
          <FieldDescription>Completing a programme needs every linked task completed.</FieldDescription>
        </Field>
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <Footer busy={save.isPending} onCancel={() => guard.confirm(() => onDone())} onSave={() => void submit()} label={record ? "Save changes" : "Create programme"} />
      </div>
    </>
  );
}
