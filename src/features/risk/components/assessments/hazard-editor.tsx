"use client";

import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normaliseLabel } from "@/lib/lookups";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RiskFormSettings } from "@/lib/forms/settings";
import { CHECKLIST_RESULT_LABELS, CHECKLIST_RESULTS, hazardWordTitle, type ChecklistResultKey } from "@/lib/risk/labels";
import { FMEA_FACTORS, METHOD_RATING_MAX, type FmeaGroup, type RiskMethod } from "@/lib/risk/scoring";
import { cn } from "@/lib/utils";
import { classify, scoreHazard } from "@/server/modules/risk/scoring";
import { hazardGaps } from "@/server/modules/risk/workflow";
import { ScoreChip } from "../shared";

/** One hazard/aspect in the wizard (client draft; `id` = existing hazard). */
export interface HazardDraft {
  key: string;
  id?: string;
  activity: string;
  name: string;
  consequence: string;
  controls: string;
  recommendation: string;
  justification: string;
  likelihood: number | null;
  severity: number | null;
  factors: Record<string, number>;
  checklistResult: ChecklistResultKey | null;
}

export function newHazard(): HazardDraft {
  return { key: crypto.randomUUID(), activity: "", name: "", consequence: "", controls: "", recommendation: "", justification: "", likelihood: null, severity: null, factors: {}, checklistResult: null };
}

export const LIKELIHOOD_LABELS: Record<"5x5" | "3x3", string[]> = {
  "5x5": ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"],
  "3x3": ["Unlikely", "Possible", "Likely"],
};
export const SEVERITY_LABELS: Record<"5x5" | "3x3", string[]> = {
  "5x5": ["Minor", "Moderate", "Serious", "Major", "Catastrophic"],
  "3x3": ["Minor", "Serious", "Major"],
};

const GROUP_TITLES: Record<FmeaGroup, string> = { severity: "Severity", likelihood: "Likelihood", detection: "Detection difficulty" };

function domainKey(domain: string) {
  return domain === "ENVIRONMENT" ? "ENVIRONMENT" : "HEALTH_SAFETY";
}

/**
 * Hazard / aspect cards with method-specific inputs and a live score chip. `hazardOptions`: the risk
 * type's switched-on hazards (Configuration → Risk matrix) – the name is picked from them; without
 * any, it is typed.
 */
export function HazardEditor({
  rules,
  value,
  onChange,
  showErrors,
  hazardOptions = [],
}: {
  rules: RiskFormSettings;
  value: HazardDraft[];
  onChange: (next: HazardDraft[]) => void;
  showErrors: boolean;
  hazardOptions?: readonly string[];
}) {
  const word = hazardWordTitle(rules.domain);
  const update = (key: string, patch: Partial<HazardDraft>) => onChange(value.map((h) => (h.key === key ? { ...h, ...patch } : h)));
  const move = (index: number, delta: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    onChange(next);
  };
  return (
    <div className="space-y-4">
      {value.map((h, i) => {
        const score = scoreHazard(rules.method, rules.domain, h);
        const gaps = hazardGaps(h, rules.method, rules.domain);
        return (
          <Card key={h.key} className="gap-0 py-0">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <CardTitle className="text-base">
                {word} {i + 1}
                {h.name.trim() ? <span className="font-normal text-muted-foreground"> · {h.name.trim()}</span> : null}
              </CardTitle>
              <div className="flex items-center gap-1">
                <ScoreChip score={score} band={classify(score, rules)} method={rules.method} />
                <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Move down" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label={`Remove ${word.toLowerCase()} ${i + 1}`} onClick={() => onChange(value.filter((x) => x.key !== h.key))}>
                  <Trash2 />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id={`h-${h.key}-activity`} label="Activity / job step *" value={h.activity} onChange={(v) => update(h.key, { activity: v })} invalid={showErrors && !h.activity.trim()} placeholder="e.g. Loading trailers" />
                {hazardOptions.length ? (
                  <HazardNamePicker id={`h-${h.key}-name`} label={`${word} *`} word={word.toLowerCase()} options={hazardOptions} value={h.name} onChange={(v) => update(h.key, { name: v })} invalid={showErrors && !h.name.trim()} />
                ) : (
                  <TextField id={`h-${h.key}-name`} label={`${word} *`} value={h.name} onChange={(v) => update(h.key, { name: v })} invalid={showErrors && !h.name.trim()} placeholder={rules.domain === "ENVIRONMENT" ? "e.g. Release to surface water" : "e.g. Moving vehicles"} />
                )}
                <TextField id={`h-${h.key}-consequence`} label="Consequence *" value={h.consequence} onChange={(v) => update(h.key, { consequence: v })} invalid={showErrors && !h.consequence.trim()} placeholder={rules.domain === "ENVIRONMENT" ? "e.g. Water contamination" : "e.g. Serious injury"} />
                <TextField id={`h-${h.key}-controls`} label="Current controls *" value={h.controls} onChange={(v) => update(h.key, { controls: v })} invalid={showErrors && !h.controls.trim()} multiline placeholder="What is already in place?" />
              </div>
              <MethodInputs method={rules.method} domain={rules.domain} hazard={h} onChange={(patch) => update(h.key, patch)} invalid={showErrors && gaps.some((g) => /likelihood|severity|FMEA|checklist/.test(g))} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id={`h-${h.key}-just`} label="Scoring justification *" value={h.justification} onChange={(v) => update(h.key, { justification: v })} invalid={showErrors && !h.justification.trim()} multiline placeholder="Why these values?" />
                <TextField id={`h-${h.key}-rec`} label="Recommendations" value={h.recommendation} onChange={(v) => update(h.key, { recommendation: v })} multiline placeholder="Further controls to consider" />
              </div>
              {showErrors && gaps.length > 0 && <p className="text-sm text-destructive">Still needed: {gaps.join(", ")}.</p>}
            </CardContent>
          </Card>
        );
      })}
      <Button type="button" variant="outline" onClick={() => onChange([...value, newHazard()])}>
        <Plus /> Add {word.toLowerCase()}
      </Button>
    </div>
  );
}

/** Searchable dropdown of the risk type's hazards. A name the hazard already has stays, even if it is no longer offered. */
function HazardNamePicker({ id, label, word, options, value, onChange, invalid }: { id: string; label: string; word: string; options: readonly string[]; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = value.trim();
  const listed = options.some((o) => normaliseLabel(o) === normaliseLabel(current));
  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid || undefined} className="h-9 w-full justify-between font-normal">
            <span className={cn("truncate", !current && "text-muted-foreground")}>{current || `Choose a ${word}…`}</span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${word}s…`} />
            <CommandList>
              <CommandEmpty>No matching {word}. Ask an administrator to add it to the list.</CommandEmpty>
              {current && !listed && (
                <CommandGroup heading="Current">
                  <CommandItem value={`__current ${current}`} onSelect={() => choose(current)}>
                    <Check className="size-4" />
                    <span className="flex-1 truncate">{current}</span>
                    <span className="text-xs text-muted-foreground">no longer in the list</span>
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup heading={`${word.charAt(0).toUpperCase()}${word.slice(1)}s`}>
                {options.map((o) => (
                  <CommandItem key={o} value={o} onSelect={() => choose(o)}>
                    <Check className={cn("size-4", normaliseLabel(o) === normaliseLabel(current) ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{o}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function TextField({ id, label, value, onChange, invalid, multiline, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; invalid?: boolean; multiline?: boolean; placeholder?: string }) {
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={invalid || undefined} />
      ) : (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={invalid || undefined} />
      )}
    </Field>
  );
}

function MethodInputs({ method, domain, hazard, onChange, invalid }: { method: RiskMethod; domain: string; hazard: HazardDraft; onChange: (patch: Partial<HazardDraft>) => void; invalid: boolean }) {
  if (method === "5x5" || method === "3x3") {
    const max = METHOD_RATING_MAX[method];
    return (
      <div className={cn("grid gap-4 rounded-xl border p-3 lg:grid-cols-2", invalid && "border-destructive/50")}>
        <RatingPicker label="Likelihood *" labels={LIKELIHOOD_LABELS[method]} value={hazard.likelihood} max={max} onChange={(v) => onChange({ likelihood: v })} />
        <RatingPicker label="Severity *" labels={SEVERITY_LABELS[method]} value={hazard.severity} max={max} onChange={(v) => onChange({ severity: v })} />
      </div>
    );
  }
  if (method === "CHECKLIST") {
    return (
      <Field className={cn("rounded-xl border p-3", invalid && "border-destructive/50")}>
        <FieldLabel>Result *</FieldLabel>
        <ToggleGroup type="single" variant="outline" value={hazard.checklistResult ?? ""} onValueChange={(v) => onChange({ checklistResult: (v || null) as ChecklistResultKey | null })} className="w-full sm:w-fit">
          {CHECKLIST_RESULTS.map((r) => (
            <ToggleGroupItem key={r} value={r} className="flex-1 px-5">
              {CHECKLIST_RESULT_LABELS[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">“No” means action is required; Yes and N/A are satisfactory.</p>
      </Field>
    );
  }
  const factors = FMEA_FACTORS[domainKey(domain)];
  return (
    <div className={cn("grid gap-4 rounded-xl border p-3 lg:grid-cols-3", invalid && "border-destructive/50")}>
      {(["severity", "likelihood", "detection"] as const).map((group) => {
        const items = factors.filter((f) => f.group === group);
        const rated = items.filter((f) => hazard.factors[f.key] !== undefined);
        const avg = rated.length === items.length ? items.reduce((s, f) => s + hazard.factors[f.key]!, 0) / items.length : null;
        return (
          <fieldset key={group} className="space-y-2">
            <legend className="flex w-full items-center justify-between text-sm font-medium">
              {GROUP_TITLES[group]} <span className="text-xs font-normal text-muted-foreground">{avg === null ? `${rated.length}/${items.length} rated` : `average ${avg.toFixed(1)}`}</span>
            </legend>
            {items.map((f) => {
              const v = hazard.factors[f.key];
              return (
                <label key={f.key} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-xs">
                  <span className="truncate" title={f.label}>
                    {f.label}
                  </span>
                  <span className={cn("w-6 text-right font-semibold tabular-nums", v === undefined && "text-muted-foreground")}>{v ?? "–"}</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={v ?? 5}
                    onChange={(e) => onChange({ factors: { ...hazard.factors, [f.key]: Number(e.target.value) } })}
                    onClick={(e) => {
                      // A click on an unrated slider also rates it at its current position.
                      if (v === undefined) onChange({ factors: { ...hazard.factors, [f.key]: Number((e.target as HTMLInputElement).value) } });
                    }}
                    className={cn("col-span-2 h-2 w-full cursor-pointer accent-[var(--brand)]", v === undefined && "opacity-50")}
                    aria-label={`${f.label} (1–10)`}
                  />
                </label>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}

function RatingPicker({ label, labels, value, max, onChange }: { label: string; labels: string[]; value: number | null; max: number; onChange: (v: number | null) => void }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup type="single" variant="outline" value={value ? String(value) : ""} onValueChange={(v) => onChange(v ? Number(v) : null)} className="grid w-full" style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}>
        {Array.from({ length: max }, (_, i) => (
          <ToggleGroupItem key={i} value={String(i + 1)} className="h-auto flex-col gap-0 px-1 py-1.5" aria-label={`${i + 1} – ${labels[i]}`}>
            <span className="text-sm font-semibold">{i + 1}</span>
            <span className="hidden text-[10px] leading-tight text-muted-foreground sm:block">{labels[i]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground sm:hidden">{value ? `${value} · ${labels[value - 1]}` : "Choose a value"}</p>
    </Field>
  );
}
