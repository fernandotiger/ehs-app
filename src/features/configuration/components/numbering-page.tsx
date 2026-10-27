"use client";

import { Hash, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { errorMessage } from "@/lib/api-client";
import { MODULES } from "@/lib/modules";
import { formatReference, NUMBERING_KEYS, NUMBERING_TYPES, numberFormatSchema, type NumberFormat, type NumberingSettings } from "@/lib/settings/numbering";
import { useSaveVersionedSetting, useVersionedSetting } from "../api";
import { ConfigHeader } from "./shared";

const YEAR = new Date().getFullYear();

/** /configuration/numbering – prefix, year and padding per record type with a live preview. */
export function NumberingPage() {
  const query = useVersionedSetting("numbering");
  if (query.isPending) return <LoadingRows rows={8} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <NumberingForm key={query.data.version} saved={query.data.value} version={query.data.version} onReload={() => query.refetch()} />;
}

function NumberingForm({ saved, version, onReload }: { saved: NumberingSettings; version: number; onReload: () => unknown }) {
  const { hasModule } = useCurrentUser();
  const save = useSaveVersionedSetting("numbering");
  const [draft, setDraft] = useState<NumberingSettings>(saved);
  const [stale, setStale] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const guard = useUnsavedChangesGuard(dirty);
  const errors = Object.fromEntries(
    NUMBERING_KEYS.map((key) => {
      const result = numberFormatSchema.safeParse(draft[key]);
      return [key, result.success ? null : (result.error.issues[0]?.message ?? "Invalid format")];
    }),
  );
  const invalid = Object.values(errors).some(Boolean);

  function change(key: string, patch: Partial<NumberFormat>) {
    setDraft((d) => ({ ...d, [key]: { ...d[key]!, ...patch } }));
  }

  async function submit() {
    if (invalid) {
      toast.error("Fix the highlighted prefixes first");
      return;
    }
    try {
      const value = Object.fromEntries(Object.entries(draft).map(([k, f]) => [k, { ...f, prefix: f.prefix.trim().toUpperCase() }]));
      await save.mutateAsync({ value, expectedVersion: version });
      toast.success("Reference numbers saved – new records use the new format");
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      {guard.dialog}
      <ConfigHeader
        title="Reference numbers"
        description="How new records are numbered. Existing reference numbers never change; counters restart each year when the year is included."
        actions={
          <>
            <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => setDraft(saved)}>
              <RotateCcw /> Discard
            </Button>
            <Button disabled={!dirty || save.isPending} onClick={() => void submit()}>
              {save.isPending ? <Spinner /> : <Save />} Save changes
            </Button>
          </>
        }
      />
      {stale && <StaleVersionAlert className="mb-4" draft={draft} draftName="reference-numbers" onReload={onReload} />}
      <Card className="gap-0 overflow-hidden py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Record type</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Include year</TableHead>
                <TableHead>Digits</TableHead>
                <TableHead className="pr-4">Next reference looks like</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {NUMBERING_KEYS.map((key) => {
                const type = NUMBERING_TYPES[key];
                const format = draft[key]!;
                const error = errors[key];
                const enabled = hasModule(type.module);
                return (
                  <TableRow key={key}>
                    <TableCell className="pl-4">
                      <span className="block font-medium">{type.label}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {MODULES[type.module].name}
                        {!enabled && <StatusBadge className="h-5 text-[11px]">Module off</StatusBadge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={format.prefix}
                        onChange={(e) => change(key, { prefix: e.target.value.toUpperCase() })}
                        className="w-28 font-mono uppercase"
                        aria-label={`${type.label} prefix`}
                        aria-invalid={Boolean(error)}
                        maxLength={10}
                      />
                      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
                    </TableCell>
                    <TableCell>
                      <Switch checked={format.includeYear} onCheckedChange={(v) => change(key, { includeYear: v })} aria-label={`${type.label}: include year`} />
                    </TableCell>
                    <TableCell>
                      <Select value={String(format.padding)} onValueChange={(v) => change(key, { padding: Number(v) })}>
                        <SelectTrigger className="w-20" aria-label={`${type.label}: number of digits`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="pr-4">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-sm">
                        <Hash className="size-3.5 text-muted-foreground" />
                        {error ? "—" : formatReference({ ...format, prefix: format.prefix.trim() }, YEAR, 1)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
