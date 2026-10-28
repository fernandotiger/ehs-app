"use client";

import { Check, ListPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/api-client";
import { HAZARD_OPTION_MAX } from "@/lib/risk/hazard-options";
import { hazardWord, hazardWordTitle } from "@/lib/risk/labels";
import { cn } from "@/lib/utils";
import { useHazardOptionCommands, useMatrixHazards, type HazardOptionDto } from "../../api";

/**
 * The selected risk type's hazards (aspects for Environment forms): the options of the Hazard
 * dropdown on its assessments. Changes apply at once; assessments keep the names they have.
 */
export function HazardListPanel({ formId, domain }: { formId: string; domain: string }) {
  const list = useMatrixHazards(formId);
  const commands = useHazardOptionCommands(formId);
  const [label, setLabel] = useState("");
  const word = hazardWord(domain);
  const words = hazardWord(domain, true);
  const offered = list.data?.filter((o) => o.isActive).length ?? 0;

  async function add() {
    const clean = label.trim();
    if (!clean) return;
    try {
      await commands.add.mutateAsync(clean);
      setLabel("");
      toast.success(`“${clean}” added`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>{hazardWordTitle(domain, true)}</CardTitle>
        <CardDescription>
          The choices in the {hazardWordTitle(domain)} dropdown of assessments using this form. Changes apply straight away; assessments keep the {word} names they
          already have. {offered === 0 ? `With no ${word} switched on, people type the ${word} themselves.` : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={domain === "ENVIRONMENT" ? "e.g. Release to surface water" : "e.g. Moving vehicles"} maxLength={HAZARD_OPTION_MAX} aria-label={`New ${word}`} />
          <Button type="submit" disabled={!label.trim() || commands.add.isPending} className="shrink-0">
            <Plus /> Add
          </Button>
        </form>

        {list.isPending ? (
          <LoadingRows rows={3} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            <ListPlus className="size-6" />
            <p>
              No {words} yet. Add the {words} people should choose from – until then they type the {word}.
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {list.data.map((o) => (
              <HazardRow key={o.id} option={o} word={word} commands={commands} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HazardRow({ option, word, commands }: { option: HazardOptionDto; word: string; commands: ReturnType<typeof useHazardOptionCommands> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(option.label);
  const [confirm, setConfirm] = useState(false);
  const busy = commands.update.isPending || commands.remove.isPending;

  async function rename() {
    const clean = draft.trim();
    if (!clean || clean === option.label) return setEditing(false);
    try {
      await commands.update.mutateAsync({ id: option.id, label: clean });
      setEditing(false);
      toast.success(`Renamed to “${clean}”`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function toggle(isActive: boolean) {
    try {
      await commands.update.mutateAsync({ id: option.id, isActive });
      toast.success(isActive ? `“${option.label}” is offered again` : `“${option.label}” is switched off`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function remove() {
    try {
      await commands.remove.mutateAsync(option.id);
      toast.success(`“${option.label}” removed`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const used = option.usedCount ? `Used ${option.usedCount} time${option.usedCount === 1 ? "" : "s"}` : "Not used yet";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      {editing ? (
        <form
          className="flex min-w-0 flex-1 basis-56 gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={HAZARD_OPTION_MAX} aria-label={`New name for ${option.label}`} autoFocus className="h-8" />
          <Button type="submit" size="icon" variant="ghost" className="size-8" aria-label="Save name" disabled={busy}>
            <Check />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Cancel rename"
            onClick={() => {
              setDraft(option.label);
              setEditing(false);
            }}
          >
            <X />
          </Button>
        </form>
      ) : (
        <div className="min-w-0 flex-1 basis-56">
          <p className={cn("truncate text-sm font-medium", !option.isActive && "text-muted-foreground line-through decoration-muted-foreground/50")}>{option.label}</p>
          <p className="text-xs text-muted-foreground">
            {used}
            {!option.isActive && " · not offered"}
          </p>
        </div>
      )}
      <div className="flex items-center gap-1">
        <label className="mr-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={option.isActive} onCheckedChange={(v) => void toggle(v)} disabled={busy} aria-label={`Offer ${option.label}`} />
          {option.isActive ? <StatusBadge tone="success">Offered</StatusBadge> : <StatusBadge>Off</StatusBadge>}
        </label>
        {!editing && (
          <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={`Rename ${option.label}`} onClick={() => setEditing(true)} disabled={busy}>
            <Pencil />
          </Button>
        )}
        <Button type="button" size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label={`Remove ${option.label}`} onClick={() => setConfirm(true)} disabled={busy}>
          <Trash2 />
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove “${option.label}”?`}
        description={
          option.usedCount
            ? `It will no longer be offered. The ${option.usedCount} ${word}${option.usedCount === 1 ? "" : "s"} already named “${option.label}” keep that name. To offer it again later, switch it off instead of removing it.`
            : `It will no longer be offered in the ${word} dropdown.`
        }
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
      />
    </li>
  );
}
