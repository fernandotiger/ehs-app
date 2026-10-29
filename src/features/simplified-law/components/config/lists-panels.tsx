"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { isStaleVersion } from "@/components/common/stale-version-alert";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api-client";
import { DEFAULT_STATUS_LABELS, LEGAL_STATUSES, STATUS_HINTS, type StatusLabels } from "@/lib/simplified-law";
import { useAddJurisdiction, useMoveJurisdiction, useRemoveJurisdiction, useRenameJurisdiction, useSaveSettings, useSlawSettings, type SlawSettingsDto } from "../../api";
import { blockersOf, STALE_MESSAGE } from "../../format";
import { Blockers } from "../shared";
import { NameDialog } from "./name-dialog";

/** Jurisdictions offered when adding a law (EU, Ireland, …): add, rename (renames it on every law), re-order, remove when unused. */
export function JurisdictionsPanel() {
  const settings = useSlawSettings();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const add = useAddJurisdiction();
  const rename = useRenameJurisdiction();
  const remove = useRemoveJurisdiction();
  const move = useMoveJurisdiction();

  async function run(promise: Promise<unknown>, done: string) {
    try {
      await promise;
      toast.success(done);
    } catch (error) {
      const blockers = blockersOf(error);
      toast.error(blockers.length ? blockers.join(" ") : errorMessage(error));
    }
  }

  if (settings.isPending) return <LoadingRows rows={3} />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;
  const list = settings.data.jurisdictions;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-col gap-2 border-b py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Jurisdictions</CardTitle>
          <CardDescription>Where a law comes from. Shown on every law and used as a filter.</CardDescription>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus /> Add jurisdiction
        </Button>
      </CardHeader>
      <ul className="divide-y">
        {list.map((j, i) => (
          <li key={j} className="flex items-center justify-between gap-2 px-4 py-2">
            <span className="text-sm font-medium">{j}</span>
            <span className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${j} up`} disabled={i === 0} onClick={() => void run(move.mutateAsync({ name: j, direction: "up" }), "Moved up")}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${j} down`} disabled={i === list.length - 1} onClick={() => void run(move.mutateAsync({ name: j, direction: "down" }), "Moved down")}>
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Rename ${j}`} onClick={() => setRenaming(j)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${j}`} onClick={() => setRemoving(j)}>
                <Trash2 />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <NameDialog open={adding} onOpenChange={setAdding} title="New jurisdiction" placeholder="e.g. Northern Ireland" submitLabel="Add" onSubmit={(v) => add.mutateAsync(v.name)} />
      <NameDialog
        open={renaming !== null}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename jurisdiction"
        description="Every law that uses it is renamed too."
        initialName={renaming ?? ""}
        onSubmit={(v) => rename.mutateAsync({ from: renaming ?? "", to: v.name })}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove "${removing ?? ""}"?`}
        description="Only a jurisdiction that no law uses can be removed."
        confirmLabel="Remove"
        destructive
        onConfirm={() => run(remove.mutateAsync(removing ?? ""), "Jurisdiction removed")}
      />
    </Card>
  );
}

/** Register title (the storyboard's "[Product name] Legislation & Compliance Register"), status wording and defaults. */
export function SettingsPanel() {
  const settings = useSlawSettings();
  if (settings.isPending) return <LoadingRows rows={4} />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;
  return <SettingsForm key={settings.data.version} settings={settings.data} />;
}

function SettingsForm({ settings }: { settings: SlawSettingsDto }) {
  const [title, setTitle] = useState(settings.registerTitle);
  const [labels, setLabels] = useState<StatusLabels>(settings.statusLabels);
  const [hideRepealed, setHideRepealed] = useState(settings.hideRepealed);
  const [days, setDays] = useState(String(settings.defaultActionDays));
  const [blockers, setBlockers] = useState<string[]>([]);
  const save = useSaveSettings();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBlockers([]);
    try {
      await save.mutateAsync({ expectedVersion: settings.version, registerTitle: title, statusLabels: labels, hideRepealed, defaultActionDays: Number(days) });
      toast.success("Settings saved");
    } catch (error) {
      setBlockers(blockersOf(error));
      toast.error(isStaleVersion(error) ? STALE_MESSAGE : errorMessage(error));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>What people see at the top of Simplified law.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="slaw-title">Register title *</FieldLabel>
            <Input id="slaw-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
            <FieldDescription>e.g. &quot;Northstar Legislation &amp; Compliance Register&quot;.</FieldDescription>
          </Field>
          <div className="flex items-start gap-3">
            <Switch id="slaw-hide" checked={hideRepealed} onCheckedChange={setHideRepealed} className="mt-0.5" />
            <div>
              <Label htmlFor="slaw-hide">Hide repealed laws by default</Label>
              <p className="text-xs text-muted-foreground">People can still switch them on in the list; they are shown greyed.</p>
            </div>
          </div>
          <Field>
            <FieldLabel htmlFor="slaw-days">Suggested due date for a new action *</FieldLabel>
            <div className="flex items-center gap-2">
              <Input id="slaw-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="w-24" />
              <span className="text-sm text-muted-foreground">days from today</span>
            </div>
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Wording of the legal statuses</CardTitle>
          <CardDescription>Use your company&apos;s words; the meaning stays the same.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {LEGAL_STATUSES.map((s) => (
            <Field key={s}>
              <FieldLabel htmlFor={`slaw-status-${s}`}>
                {DEFAULT_STATUS_LABELS[s]} <span className="font-normal text-muted-foreground">– {STATUS_HINTS[s]}</span>
              </FieldLabel>
              <Input id={`slaw-status-${s}`} value={labels[s]} onChange={(e) => setLabels((l) => ({ ...l, [s]: e.target.value }))} maxLength={40} />
            </Field>
          ))}
        </CardContent>
      </Card>
      <div className="space-y-3 lg:col-span-2">
        <Blockers title="Not saved" blockers={blockers} />
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : <Save />} Save settings
          </Button>
        </div>
      </div>
    </form>
  );
}
