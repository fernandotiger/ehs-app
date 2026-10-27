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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SimpleSelect } from "@/features/incidents/components/fields";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { PERMISSIONS } from "@/lib/permissions";
import { TASK_KIND_LABELS, type TaskKind } from "@/lib/risk/labels";
import type { RiskMethod } from "@/lib/risk/scoring";
import { factorValue, findFactor, scoringFactors } from "@/server/modules/risk/scoring";
import { taskBlockers } from "@/server/modules/risk/workflow";
import { useAssessment, useAssessments, useCreateTask, useProgrammes, useUpdateTask, type TaskDetailDto } from "../../api";
import { addDaysLocal, blockersOf, todayLocal } from "../../format";
import { BlockerList } from "../shared";

export type TaskSheetConfig =
  | { mode: "create"; kind?: TaskKind; assessmentId?: string; hazardId?: string; programmeId?: string; parent?: Pick<TaskDetailDto, "id" | "reference" | "kind" | "programme" | "assessment" | "hazard"> }
  | { mode: "edit"; task: TaskDetailDto };

interface Values {
  kind: TaskKind;
  title: string;
  info: string;
  ownerId: string | null;
  createdOn: string;
  dueDate: string;
  programmeId: string | null;
  assessmentId: string | null;
  hazardId: string | null;
  factor: string | null;
  targetValue: string;
}

function initial(c: TaskSheetConfig): Values {
  if (c.mode === "edit") {
    const t = c.task;
    return {
      kind: t.kind,
      title: t.title,
      info: t.info ?? "",
      ownerId: t.owner.id,
      createdOn: t.createdOn,
      dueDate: t.dueDate,
      programmeId: t.programme.id,
      assessmentId: t.assessment?.id || null,
      hazardId: t.hazard?.id ?? null,
      factor: t.factor,
      targetValue: t.targetValue === null ? "" : String(t.targetValue),
    };
  }
  const today = todayLocal();
  return {
    kind: c.parent?.kind ?? c.kind ?? (c.assessmentId ? "RA" : "MP"),
    title: "",
    info: "",
    ownerId: null,
    createdOn: today,
    dueDate: addDaysLocal(today, 30),
    programmeId: c.parent?.programme.id ?? c.programmeId ?? null,
    assessmentId: c.parent?.assessment?.id || c.assessmentId || null,
    hazardId: c.parent?.hazard?.id ?? c.hazardId ?? null,
    factor: null,
    targetValue: "",
  };
}

/** Create / edit a Risk task or sub-task (RA: assessment + hazard + optional scoring factor; MP: programme work). */
export function TaskFormSheet({ open, onOpenChange, config, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; config: TaskSheetConfig; onSaved?: (id: string) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {open && (
          <TaskForm
            config={config}
            onDone={(id) => {
              onOpenChange(false);
              if (id) onSaved?.(id);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskForm({ config, onDone }: { config: TaskSheetConfig; onDone: (id?: string) => void }) {
  const { can } = useCurrentUser();
  const [start] = useState(() => initial(config));
  const [v, setV] = useState<Values>(start);
  const [showErrors, setShowErrors] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const create = useCreateTask();
  const update = useUpdateTask(config.mode === "edit" ? config.task.id : "");
  const guard = useUnsavedChangesGuard(JSON.stringify(v) !== JSON.stringify(start));
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const parent = config.mode === "create" ? config.parent : config.task.parent;
  const isSub = Boolean(parent);
  // What the form shows for inherited links (the parent in create mode, the task itself when editing).
  const linked = config.mode === "create" ? config.parent : config.task;
  const fixedAssessment = isSub || (config.mode === "create" && Boolean(config.assessmentId));
  const programmes = useProgrammes({ page: 1, pageSize: 100, status: "OPEN" });
  const assessments = useAssessments({ page: 1, pageSize: 100, status: "ACTIVE", sort: "reference", dir: "asc" }, v.kind === "RA" && !fixedAssessment);
  const assessment = useAssessment(v.kind === "RA" ? v.assessmentId : null);
  const a = v.kind === "RA" && v.assessmentId ? assessment.data : undefined;
  const hazard = a?.hazards.find((h) => h.id === v.hazardId);
  const factors = a && !isSub ? scoringFactors(a.method as RiskMethod, a.domain) : [];
  const factor = a && v.factor ? findFactor(a.method as RiskMethod, a.domain, v.factor) : null;
  const original = a && hazard && factor ? factorValue(a.method as RiskMethod, hazard, factor.key) : null;
  const busy = create.isPending || update.isPending;
  const canAssign = config.mode === "create" || can(PERMISSIONS.RISK_TASK_ASSIGN);

  const programmeOptions = (programmes.data?.items ?? []).map((p) => ({ value: p.id, label: p.title }));
  if (v.programmeId && !programmeOptions.some((o) => o.value === v.programmeId)) {
    programmeOptions.unshift({ value: v.programmeId, label: linked?.programme.title ?? "Current programme" });
  }

  async function save() {
    setBlockers([]);
    const local = taskBlockers({ kind: v.kind, title: v.title, ownerId: v.ownerId, createdOn: v.createdOn || null, dueDate: v.dueDate || null, programmeId: v.programmeId, assessmentId: v.assessmentId, hazardId: v.hazardId });
    if (local.length) {
      setShowErrors(true);
      setBlockers(local);
      return;
    }
    const target = v.targetValue.trim() === "" ? null : Number(v.targetValue);
    const body = {
      title: v.title.trim(),
      info: v.info.trim() || null,
      ownerId: v.ownerId,
      createdOn: v.createdOn,
      dueDate: v.dueDate,
      programmeId: v.programmeId,
      assessmentId: v.kind === "RA" ? v.assessmentId : null,
      hazardId: v.kind === "RA" ? v.hazardId : null,
      factor: v.kind === "RA" && !isSub ? v.factor : null,
      targetValue: v.kind === "RA" && !isSub && v.factor ? target : null,
    };
    try {
      if (config.mode === "edit") {
        await update.mutateAsync({ ...body, expectedVersion: config.task.version });
        toast.success("Task updated");
        onDone(config.task.id);
      } else {
        const res = await create.mutateAsync({ ...body, kind: v.kind, parentId: parent?.id ?? null });
        toast.success(`Task ${res.reference} created`);
        onDone(res.id);
      }
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      setBlockers(blockersOf(error));
      toast.error(errorMessage(error));
    }
  }

  const title = config.mode === "edit" ? `Edit ${config.task.reference}` : parent ? `Sub-task of ${parent.reference}` : "New risk task";
  return (
    <>
      {guard.dialog}
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{parent ? "A sub-task shares its parent's programme and assessment. It never changes a score on its own." : "Every task belongs to a management programme. Assessment tasks can change a score when they are completed."}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-4">
        {stale && config.mode === "edit" && <StaleVersionAlert draft={v} draftName="risk-task" onReload={() => window.location.reload()} />}
        {config.mode === "create" && !parent && (
          <Field>
            <FieldLabel>Kind of task</FieldLabel>
            <ToggleGroup type="single" variant="outline" value={v.kind} onValueChange={(k) => k && set({ kind: k as TaskKind, ...(k === "MP" ? { factor: null } : {}) })} className="w-full" disabled={fixedAssessment}>
              {(["RA", "MP"] as const).map((k) => (
                <ToggleGroupItem key={k} value={k} className="flex-1">
                  {TASK_KIND_LABELS[k]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        )}
        <Field data-invalid={(showErrors && !v.title.trim()) || undefined}>
          <FieldLabel htmlFor="t-title">Title *</FieldLabel>
          <Input id="t-title" value={v.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Install pedestrian barrier" />
        </Field>
        <Field>
          <FieldLabel htmlFor="t-info">Additional information</FieldLabel>
          <Textarea id="t-info" rows={3} value={v.info} onChange={(e) => set({ info: e.target.value })} />
        </Field>
        <Field data-invalid={(showErrors && !v.ownerId) || undefined}>
          <FieldLabel htmlFor="t-owner">Responsible person *</FieldLabel>
          <UserPicker id="t-owner" value={v.ownerId} onChange={(id) => set({ ownerId: id })} disabled={!canAssign} placeholder="Who will do it?" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="t-created">Created on *</FieldLabel>
            <Input id="t-created" type="date" value={v.createdOn} onChange={(e) => set({ createdOn: e.target.value })} />
          </Field>
          <Field data-invalid={(showErrors && v.dueDate < v.createdOn) || undefined}>
            <FieldLabel htmlFor="t-due">Due date *</FieldLabel>
            <Input id="t-due" type="date" min={v.createdOn} value={v.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </Field>
        </div>
        <Field data-invalid={(showErrors && !v.programmeId) || undefined}>
          <FieldLabel htmlFor="t-prog">Management programme *</FieldLabel>
          <SimpleSelect id="t-prog" value={v.programmeId} onChange={(x) => set({ programmeId: x })} options={programmeOptions} placeholder="Choose a programme…" disabled={isSub} />
          {!isSub && <FieldDescription>Connects the work to an objective and its targets.</FieldDescription>}
        </Field>
        {v.kind === "RA" && (
          <div className="space-y-4 rounded-xl border p-3">
            <Field data-invalid={(showErrors && !v.assessmentId) || undefined}>
              <FieldLabel htmlFor="t-assess">Assessment *</FieldLabel>
              {fixedAssessment ? (
                <Input id="t-assess" value={a ? `${a.reference} · ${a.title}` : (linked?.assessment ? `${linked.assessment.reference} · ${linked.assessment.title}` : "Loading…")} disabled />
              ) : (
                <SimpleSelect
                  id="t-assess"
                  value={v.assessmentId}
                  onChange={(x) => set({ assessmentId: x, hazardId: null, factor: null })}
                  options={(assessments.data?.items ?? []).map((x) => ({ value: x.id, label: `${x.reference} · ${x.title}` }))}
                  placeholder="Choose an assessment…"
                />
              )}
            </Field>
            <Field data-invalid={(showErrors && !v.hazardId) || undefined}>
              <FieldLabel htmlFor="t-hazard">Hazard / aspect *</FieldLabel>
              <SimpleSelect id="t-hazard" value={v.hazardId} onChange={(x) => set({ hazardId: x })} options={(a?.hazards ?? []).map((h) => ({ value: h.id, label: h.name || "Untitled" }))} placeholder={a ? "Choose…" : "Choose the assessment first"} disabled={isSub || !a} />
            </Field>
            {!isSub && (
              <>
                <Field>
                  <FieldLabel htmlFor="t-factor">Scoring factor to change</FieldLabel>
                  <SimpleSelect id="t-factor" value={v.factor} onChange={(x) => set({ factor: x })} options={factors.map((f) => ({ value: f.key, label: f.label }))} allowNone noneLabel="No score change" disabled={!a} />
                  <FieldDescription>
                    {factor ? `Current value ${original ?? "—"}. On completion the achieved value rescores the Approved assessment as a new revision.` : "Optional – choose a factor when the task should change the score."}
                  </FieldDescription>
                </Field>
                {factor && (
                  <Field>
                    <FieldLabel htmlFor="t-target">Intended {factor.label.toLowerCase()} ({factor.min}–{factor.max})</FieldLabel>
                    <Input id="t-target" type="number" min={factor.min} max={factor.max} step={1} value={v.targetValue} onChange={(e) => set({ targetValue: e.target.value })} className="w-32" />
                  </Field>
                )}
              </>
            )}
          </div>
        )}
        <BlockerList title="Not saved" blockers={blockers} tone="destructive" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => guard.confirm(() => onDone())}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner /> : <Save />} {config.mode === "edit" ? "Save changes" : "Create task"}
          </Button>
        </div>
      </div>
    </>
  );
}
