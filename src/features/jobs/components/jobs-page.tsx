"use client";

import { FlaskConical, History, Pause, Play, Plus, Send, Timer } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { MultiSelect } from "@/components/common/multi-select";
import { PaginationBar } from "@/components/common/pagination-bar";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScopePicker } from "@/features/configuration/components/scope-picker";
import { ConfigHeader, OptionFilter, SearchInput } from "@/features/configuration/components/shared";
import { useLookups } from "@/features/shared/lookups";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import {
  COMMON_TIME_ZONES,
  defaultJobInput,
  JOB_DELIVERIES,
  JOB_DELIVERY_LABELS,
  JOB_FREQUENCIES,
  JOB_FREQUENCY_LABELS,
  JOB_KIND_HINTS,
  JOB_KIND_LABELS,
  JOB_KINDS,
  JOB_RUN_TRIGGER_LABELS,
  JOB_RUN_TRIGGERS,
  scheduledJobInputSchema,
  scheduleLabel,
  WEEKDAY_LABELS,
  type JobRunOutcomeKey,
  type JobRunTriggerKey,
  type ScheduledJobInput,
} from "@/lib/jobs";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  useCreateJob,
  useJobRun,
  useJobRuns,
  useJobs,
  useJobTargets,
  useRunJob,
  useSetJobEnabled,
  useTestJob,
  useUpdateJob,
  type JobDto,
  type JobRunDetailDto,
} from "../api";
import { formatRunTime, OutcomeBadge, RunDetails, TriggerBadge } from "./run-details";

const NEW = "new";

function inputOf(job: JobDto): ScheduledJobInput {
  return {
    name: job.name,
    kind: job.kind,
    targets: job.targets,
    scopeType: job.scopeType,
    scopeId: job.scopeId,
    frequency: job.frequency,
    weekday: job.weekday ?? 1,
    dayOfMonth: job.dayOfMonth ?? 1,
    runTime: job.runTime,
    timeZone: job.timeZone,
    overdueDays: job.overdueDays,
    upcomingDays: job.upcomingDays,
    recipients: job.recipients,
    delivery: job.delivery,
    channels: job.channels,
    escalation: job.escalation,
    enabled: job.enabled,
  };
}

const stable = (v: ScheduledJobInput) => JSON.stringify({ ...v, targets: [...v.targets].sort(), recipients: { ...v.recipients, roleIds: [...v.recipients.roleIds].sort() } });

/** /configuration/jobs – jobs (list + editor) and run history. */
export function JobsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view") === "history" ? "history" : "jobs";

  function setParams(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  return (
    <>
      <ConfigHeader title="Scheduled jobs" description="Reminders and summaries delivered in the app on a schedule. Email is not connected yet." />
      <Tabs value={view} onValueChange={(v) => setParams({ view: v === "history" ? "history" : undefined })} className="mb-4">
        <TabsList className="h-9">
          <TabsTrigger value="jobs" className="px-3">
            <Timer /> Jobs
          </TabsTrigger>
          <TabsTrigger value="history" className="px-3">
            <History /> Run history
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {view === "jobs" ? <JobsView selectedId={params.get("job") ?? undefined} onSelect={(id) => setParams({ job: id })} /> : <RunHistory initialJobId={params.get("job") ?? undefined} />}
    </>
  );
}

function JobsView({ selectedId, onSelect }: { selectedId: string | undefined; onSelect: (id: string | undefined) => void }) {
  const { can, user } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "paused" | undefined>();
  const q = useDeferredValue(search.trim());
  const jobs = useJobs({ q: q || undefined, status: status ?? "all" });
  const canManage = can(PERMISSIONS.CONFIG_JOBS_MANAGE);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [dirty, setDirty] = useState(false);
  const actions = useRef<EditorActions | null>(null);

  const list = jobs.data ?? [];
  const selected = selectedId === NEW ? null : (list.find((j) => j.id === selectedId) ?? (selectedId ? undefined : list[0]));
  const editing = selectedId === NEW ? NEW : selected?.id;

  function whenSaved(action: () => void) {
    if (dirty) setPending(() => action);
    else action();
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <Card className="h-fit gap-0 py-0 lg:sticky lg:top-20">
          <div className="space-y-2 border-b p-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search jobs" />
            <OptionFilter
              value={status}
              onChange={(v) => setStatus(v as "active" | "paused" | undefined)}
              options={[
                { id: "active", name: "Active" },
                { id: "paused", name: "Paused" },
              ]}
              allLabel="Active and paused"
              ariaLabel="Status"
            />
            {canManage && (
              <Button className="w-full" variant="outline" onClick={() => whenSaved(() => onSelect(NEW))}>
                <Plus /> New job
              </Button>
            )}
          </div>
          {jobs.isPending ? (
            <LoadingRows rows={4} className="p-3" />
          ) : jobs.isError ? (
            <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} className="m-3" />
          ) : (
            <ul className="max-h-72 overflow-y-auto p-1.5 lg:max-h-[calc(100dvh-18rem)]" aria-label="Scheduled jobs">
              {list.length === 0 && <li className="p-3 text-sm text-muted-foreground">{q || status ? "No jobs match." : "No jobs yet."}</li>}
              {list.map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => j.id !== editing && whenSaved(() => onSelect(j.id))}
                    aria-current={j.id === editing}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted", j.id === editing && "bg-brand-soft hover:bg-brand-soft")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {j.name}
                        {j.id === editing && dirty ? " •" : ""}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {JOB_KIND_LABELS[j.kind]} · {scheduleLabel(j)}
                      </span>
                    </span>
                    <StatusBadge tone={j.enabled ? "success" : "neutral"} dot>
                      {j.enabled ? "Active" : "Paused"}
                    </StatusBadge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {editing ? (
          <JobEditor
            key={editing}
            job={selected ?? null}
            defaultTimeZone={user.timeZone}
            onDirtyChange={setDirty}
            actionsRef={actions}
            onCreated={(id) => onSelect(id)}
            whenSaved={whenSaved}
          />
        ) : jobs.isPending ? (
          <LoadingRows rows={8} />
        ) : (
          <EmptyState
            icon={Timer}
            title="No scheduled jobs"
            description="Create a job to remind people about overdue or upcoming work, or to send a regular summary."
            action={
              canManage && (
                <Button onClick={() => onSelect(NEW)}>
                  <Plus /> New job
                </Button>
              )
            }
          />
        )}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save your changes first?</AlertDialogTitle>
            <AlertDialogDescription>This job has unsaved changes. Save them, or discard them to go back to the saved job.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const action = pending;
                setPending(null);
                actions.current?.discard();
                action?.();
              }}
            >
              Discard
            </Button>
            <Button
              onClick={async () => {
                const action = pending;
                setPending(null);
                if (actions.current && (await actions.current.save())) action?.();
              }}
            >
              Save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface EditorActions {
  save: () => Promise<boolean>;
  discard: () => void;
}

function JobEditor({
  job,
  defaultTimeZone,
  onDirtyChange,
  actionsRef,
  onCreated,
  whenSaved,
}: {
  job: JobDto | null;
  defaultTimeZone: string;
  onDirtyChange: (dirty: boolean) => void;
  /** Lets the job list Save / Discard this editor before switching jobs. */
  actionsRef: RefObject<EditorActions | null>;
  onCreated: (id: string) => void;
  whenSaved: (action: () => void) => void;
}) {
  const { can } = useCurrentUser();
  const canManage = can(PERMISSIONS.CONFIG_JOBS_MANAGE);
  const canTest = can(PERMISSIONS.CONFIG_JOBS_TEST);
  const saved = job ? inputOf(job) : defaultJobInput(defaultTimeZone);
  const [draft, setDraft] = useState<ScheduledJobInput>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stale, setStale] = useState(false);
  const [result, setResult] = useState<JobRunDetailDto | null>(null);
  const create = useCreateJob();
  const update = useUpdateJob();
  const setEnabled = useSetJobEnabled();
  const test = useTestJob();
  const run = useRunJob();
  const targets = useJobTargets();
  const lookups = useLookups();
  const dirty = !job || stable(draft) !== stable(saved);
  const realDirty = job ? dirty : stable(draft) !== stable(defaultJobInput(defaultTimeZone));
  const guard = useUnsavedChangesGuard(realDirty);
  const readOnly = !canManage;
  const busy = create.isPending || update.isPending;
  const roleOptions = (lookups.data?.roles ?? []).map((r) => ({ value: r.id, label: r.name }));
  const set = (patch: Partial<ScheduledJobInput>) => setDraft((d) => ({ ...d, ...patch }));

  // Report dirtiness and expose Save/Discard to the list (switching jobs asks first).
  useEffect(() => onDirtyChange(realDirty), [realDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    actionsRef.current = { save, discard };
  });

  function discard() {
    setDraft(saved);
    setErrors({});
    setStale(false);
  }

  async function save(): Promise<boolean> {
    const parsed = scheduledJobInputSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as string] ??= issue.message;
      setErrors(next);
      toast.error(parsed.error.issues[0]?.message ?? "Check the job settings");
      return false;
    }
    setErrors({});
    try {
      if (job) {
        await update.mutateAsync({ id: job.id, ...parsed.data, expectedVersion: job.version });
        toast.success(`${parsed.data.name} saved`);
      } else {
        const created = await create.mutateAsync(parsed.data);
        toast.success(`${created.name} created`);
        onCreated(created.id);
      }
      setStale(false);
      return true;
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
      return false;
    }
  }

  async function execute(kind: "test" | "run") {
    if (!job) return;
    try {
      const r = kind === "test" ? await test.mutateAsync(job.id) : await run.mutateAsync(job.id);
      setResult(r);
      toast.success(kind === "test" ? `Test complete – ${r.matchedCount} matched, nothing sent` : `Run complete – ${r.deliveredCount} delivered`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const err = (key: string) => (errors[key] ? [{ message: errors[key] }] : []);

  return (
    <div className="min-w-0 space-y-4">
      {guard.dialog}
      {stale && <StaleVersionAlert draft={draft} draftName="scheduled-job" onReload={() => window.location.reload()} />}
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{job ? job.name : "New job"}</p>
            <p className="text-sm text-muted-foreground">
              {job ? (
                <>
                  {job.enabled ? "Active" : "Paused – runs only when you choose Run now"} · {scheduleLabel(job)}
                </>
              ) : (
                "Fill in the sections below, then save."
              )}
            </p>
          </div>
          {job && (
            <div className="flex flex-wrap gap-2">
              {canTest && (
                <>
                  <Button variant="outline" disabled={test.isPending} onClick={() => whenSaved(() => void execute("test"))}>
                    {test.isPending ? <Spinner /> : <FlaskConical />} Test
                  </Button>
                  <Button variant="outline" disabled={run.isPending} onClick={() => whenSaved(() => void execute("run"))}>
                    {run.isPending ? <Spinner /> : <Send />} Run now
                  </Button>
                </>
              )}
              {canManage && (
                <Button
                  variant="outline"
                  disabled={setEnabled.isPending}
                  onClick={() =>
                    whenSaved(() =>
                      setEnabled.mutate(
                        { id: job.id, enabled: !job.enabled },
                        { onSuccess: (j) => toast.success(j.enabled ? `${j.name} resumed` : `${j.name} paused`), onError: (e) => toast.error(errorMessage(e)) },
                      ),
                    )
                  }
                >
                  {job.enabled ? <Pause /> : <Play />} {job.enabled ? "Pause" : "Resume"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card className="gap-0 border-brand/40 py-0">
          <CardHeader className="flex flex-row items-center justify-between border-b p-4">
            <CardTitle className="text-base">{result.trigger === "TEST" ? "Test result" : "Run result"}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
              Close
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            <RunDetails run={result} />
          </CardContent>
        </Card>
      )}

      <Section n={1} title="What should this job do?">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="job-name">Job name *</FieldLabel>
          <Input id="job-name" value={draft.name} maxLength={80} disabled={readOnly} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Daily overdue reminders" />
          <FieldError errors={err("name")} />
        </Field>
        <RadioGroup value={draft.kind} onValueChange={(v) => set({ kind: v as ScheduledJobInput["kind"], escalation: v === "OVERDUE" ? draft.escalation : null })} disabled={readOnly} className="grid gap-2 xl:grid-cols-3">
          {JOB_KINDS.map((k) => (
            <label key={k} className={cn("flex cursor-pointer gap-2 rounded-lg border p-3 text-sm", draft.kind === k && "border-brand bg-brand-soft/40")}>
              <RadioGroupItem value={k} className="mt-0.5" />
              <span>
                <span className="block font-medium">{JOB_KIND_LABELS[k]}</span>
                <span className="block text-xs text-muted-foreground">{JOB_KIND_HINTS[k]}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        <Field data-invalid={Boolean(errors.targets)}>
          <FieldLabel>Work to check *</FieldLabel>
          <div className="grid gap-2 md:grid-cols-2">
            {(targets.data ?? []).map((t) => {
              const checked = draft.targets.includes(t.kind);
              const selectable = t.available || (!t.note?.includes("later") && t.note !== "Module not enabled");
              return (
                <label key={t.kind} className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-sm", !selectable && !checked && "opacity-60")}>
                  <Checkbox
                    checked={checked}
                    disabled={readOnly || (!selectable && !checked)}
                    onCheckedChange={(v) => set({ targets: v ? [...draft.targets, t.kind] : draft.targets.filter((x) => x !== t.kind) })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium">{t.label}</span>
                    {!t.available && <span className="block text-xs text-muted-foreground">{t.note === "Comes with the module (next phase)" ? "Nothing to check until the module is built" : t.note}</span>}
                  </span>
                </label>
              );
            })}
          </div>
          <FieldError errors={err("targets")} />
        </Field>
      </Section>

      <Section n={2} title="When should it run?" description="Times use the selected time zone. The schedule is checked by a background trigger, so delivery may be later than the exact minute.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="job-frequency">Frequency</FieldLabel>
            <Select value={draft.frequency} onValueChange={(v) => set({ frequency: v as ScheduledJobInput["frequency"] })} disabled={readOnly}>
              <SelectTrigger id="job-frequency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {JOB_FREQUENCY_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {draft.frequency === "WEEKLY" && (
            <Field>
              <FieldLabel htmlFor="job-weekday">Day</FieldLabel>
              <Select value={String(draft.weekday ?? 1)} onValueChange={(v) => set({ weekday: Number(v) })} disabled={readOnly}>
                <SelectTrigger id="job-weekday" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_LABELS.map((d, i) => (
                    <SelectItem key={d} value={String(i)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {draft.frequency === "MONTHLY" && (
            <Field>
              <FieldLabel htmlFor="job-day">Day of the month</FieldLabel>
              <Input id="job-day" type="number" min={1} max={31} value={draft.dayOfMonth ?? 1} disabled={readOnly} onChange={(e) => set({ dayOfMonth: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })} />
              <FieldDescription>Short months use their last day.</FieldDescription>
            </Field>
          )}
          <Field data-invalid={Boolean(errors.runTime)}>
            <FieldLabel htmlFor="job-time">Time</FieldLabel>
            <Input id="job-time" type="time" value={draft.runTime} disabled={readOnly} onChange={(e) => set({ runTime: e.target.value })} />
            <FieldError errors={err("runTime")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="job-tz">Time zone</FieldLabel>
            <Select value={draft.timeZone} onValueChange={(v) => set({ timeZone: v })} disabled={readOnly}>
              <SelectTrigger id="job-tz" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([draft.timeZone, defaultTimeZone, ...COMMON_TIME_ZONES])].map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Section>

      <Section n={3} title="Which work is included?">
        <ScopePicker scopeType={draft.scopeType} scopeId={draft.scopeId} onChange={(v) => set(v)} idPrefix="job-scope" error={errors.scopeId} />
        {draft.kind === "OVERDUE" && (
          <Field data-invalid={Boolean(errors.overdueDays)}>
            <FieldLabel htmlFor="job-overdue">Remind when at least this many days overdue</FieldLabel>
            <Input id="job-overdue" type="number" min={1} max={365} className="w-32" value={draft.overdueDays} disabled={readOnly} onChange={(e) => set({ overdueDays: Number(e.target.value) || 0 })} />
            <FieldDescription>Work due today is not overdue.</FieldDescription>
            <FieldError errors={err("overdueDays")} />
          </Field>
        )}
        {draft.kind === "UPCOMING" && (
          <Field>
            <FieldLabel htmlFor="job-upcoming">Look ahead (days)</FieldLabel>
            <Input id="job-upcoming" type="number" min={0} max={365} className="w-32" value={draft.upcomingDays} disabled={readOnly} onChange={(e) => set({ upcomingDays: Math.max(0, Number(e.target.value) || 0) })} />
            <FieldDescription>Work due from today up to and including this many days ahead.</FieldDescription>
          </Field>
        )}
        {draft.kind === "DIGEST" && <p className="text-sm text-muted-foreground">The summary lists all open work of the selected types in this scope.</p>}
      </Section>

      <Section n={4} title="Who is notified?" description="People only receive work in scope of their role assignment. A site role never covers another site.">
        <Field data-invalid={Boolean(errors.recipients)}>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={draft.recipients.owners} disabled={readOnly} onCheckedChange={(v) => set({ recipients: { ...draft.recipients, owners: v === true } })} /> The person the work is assigned to
          </label>
          <FieldLabel htmlFor="job-roles" className="mt-2">
            People with these roles
          </FieldLabel>
          <MultiSelect id="job-roles" options={roleOptions} value={draft.recipients.roleIds} onChange={(roleIds) => set({ recipients: { ...draft.recipients, roleIds } })} placeholder="No roles" disabled={readOnly} />
          <FieldError errors={err("recipients")} />
        </Field>
        <Field>
          <FieldLabel>Delivery</FieldLabel>
          <RadioGroup value={draft.delivery} onValueChange={(v) => set({ delivery: v as ScheduledJobInput["delivery"] })} disabled={readOnly} className="flex flex-wrap gap-4">
            {JOB_DELIVERIES.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={d} /> {JOB_DELIVERY_LABELS[d]}
              </label>
            ))}
          </RadioGroup>
        </Field>
        <Field data-invalid={Boolean(errors.channels)}>
          <FieldLabel>Channels</FieldLabel>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked disabled /> In-app (bell and My work)
            </label>
            <label className="flex items-center gap-2 text-muted-foreground">
              <Checkbox
                checked={draft.channels.includes("EMAIL")}
                disabled={readOnly}
                onCheckedChange={(v) => set({ channels: v ? ["IN_APP", "EMAIL"] : ["IN_APP"] })}
              />
              Email <StatusBadge tone="neutral">Not connected</StatusBadge>
            </label>
          </div>
          {draft.channels.includes("EMAIL") && <FieldDescription>Email is not connected: nothing is emailed, and runs say so.</FieldDescription>}
          <FieldError errors={err("channels")} />
        </Field>
      </Section>

      {draft.kind === "OVERDUE" && (
        <Section n={5} title="Escalation" description="Also tell a role when work stays overdue for longer.">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={Boolean(draft.escalation)} disabled={readOnly} onCheckedChange={(v) => set({ escalation: v ? { afterDays: Math.max(7, draft.overdueDays), roleIds: [] } : null })} /> Escalate long-overdue work
          </label>
          {draft.escalation && (
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <Field data-invalid={Boolean(errors.escalation)}>
                <FieldLabel htmlFor="job-esc-days">After (days overdue)</FieldLabel>
                <Input
                  id="job-esc-days"
                  type="number"
                  min={1}
                  max={365}
                  value={draft.escalation.afterDays}
                  disabled={readOnly}
                  onChange={(e) => set({ escalation: { ...draft.escalation!, afterDays: Number(e.target.value) || 0 } })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="job-esc-roles">Escalate to</FieldLabel>
                <MultiSelect id="job-esc-roles" options={roleOptions} value={draft.escalation.roleIds} onChange={(roleIds) => set({ escalation: { ...draft.escalation!, roleIds } })} placeholder="Choose a role" disabled={readOnly} />
              </Field>
              <FieldError className="sm:col-span-2" errors={err("escalation")} />
            </div>
          )}
        </Section>
      )}

      <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        <strong className="text-foreground">At a glance:</strong> {scheduleLabel(draft)}, check {draft.targets.length || "no"} type{draft.targets.length === 1 ? "" : "s"} of work and send{" "}
        {draft.delivery === "DIGEST" ? "one grouped message per person" : "one message per record"} in the app.{" "}
        {job && !job.enabled ? "The job is paused." : ""}
      </p>

      {canManage && dirty && (
        <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-lg md:bottom-4">
          <span className="text-sm font-medium">{job ? `Unsaved changes to ${job.name}` : "New job – not saved yet"}</span>
          <div className="flex gap-2">
            {job && (
              <Button variant="outline" onClick={discard} disabled={busy}>
                Discard
              </Button>
            )}
            <Button onClick={() => void save()} disabled={busy}>
              {busy && <Spinner />} {job ? "Save" : "Create job"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ n, title, description, children }: { n: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b p-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{n}</span>
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4 p-4">{children}</CardContent>
    </Card>
  );
}

// ── Run history ─────────────────────────────────────────────────────────────

function RunHistory({ initialJobId }: { initialJobId?: string }) {
  const [page, setPage] = useState(1);
  const [jobId, setJobId] = useState<string | undefined>(initialJobId);
  const [outcome, setOutcome] = useState<JobRunOutcomeKey | undefined>();
  const [trigger, setTrigger] = useState<JobRunTriggerKey | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const jobs = useJobs({ status: "all" });
  const runs = useJobRuns({ page, pageSize: 20, jobId, outcome, trigger });
  const detail = useJobRun(openId);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <OptionFilter value={jobId} onChange={(v) => { setJobId(v); setPage(1); }} options={(jobs.data ?? []).map((j) => ({ id: j.id, name: j.name }))} allLabel="All jobs" ariaLabel="Job" />
        <OptionFilter value={outcome} onChange={(v) => { setOutcome(v as JobRunOutcomeKey | undefined); setPage(1); }} options={[{ id: "COMPLETED", name: "Completed" }, { id: "FAILED", name: "Failed" }]} allLabel="Any outcome" ariaLabel="Outcome" />
        <OptionFilter value={trigger} onChange={(v) => { setTrigger(v as JobRunTriggerKey | undefined); setPage(1); }} options={JOB_RUN_TRIGGERS.map((t) => ({ id: t, name: JOB_RUN_TRIGGER_LABELS[t] }))} allLabel="Any trigger" ariaLabel="Trigger" />
      </div>
      {runs.isPending ? (
        <LoadingRows rows={6} />
      ) : runs.isError ? (
        <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
      ) : runs.data.items.length === 0 ? (
        <EmptyState icon={History} title="No runs yet" description="Test or run a job to see its results here. The latest 500 runs are kept." />
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {runs.data.items.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.jobName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatRunTime(r)} ({r.timeZone})
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <TriggerBadge trigger={r.trigger} />
                    <OutcomeBadge outcome={r.outcome} />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {r.matchedCount} matched · {r.deliveredCount} delivered · {r.escalatedCount} escalated
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t p-2">
            <PaginationBar page={page} pageSize={20} total={runs.data.total} onPageChange={setPage} />
          </div>
        </Card>
      )}
      <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{detail.data?.jobName ?? "Run details"}</SheetTitle>
            <SheetDescription>What the job found and who was told.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{detail.isPending ? <LoadingRows rows={4} /> : detail.isError ? <ErrorState error={detail.error} /> : <RunDetails run={detail.data} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
