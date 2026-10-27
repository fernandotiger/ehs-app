"use client";

import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MultiSelect } from "@/components/common/multi-select";
import { isStaleVersion, StaleVersionAlert } from "@/components/common/stale-version-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useLookups } from "@/features/shared/lookups";
import { errorMessage } from "@/lib/api-client";
import { readRiskSettings, type RiskFormSettings } from "@/lib/forms/settings";
import {
  METHOD_MAX_SCORE,
  REVIEW_FREQUENCIES,
  RISK_DOMAIN_LABELS,
  RISK_DOMAINS,
  RISK_METHOD_LABELS,
  reviewFrequencyLabel,
  validateThresholds,
  type RiskDomain,
} from "@/lib/risk/scoring";
import { useSaveRiskRules, type FormDetailDto } from "../api";

/**
 * Risk matrix and review rules = the Risk form's settings. On a form with a published version,
 * saving publishes a new version at once (existing assessments keep the rules they captured).
 */
export function RiskRulesPanel({ form, blocked, onDirtyChange, onReload }: { form: FormDetailDto; blocked: boolean; onDirtyChange: (dirty: boolean) => void; onReload: () => void }) {
  const saved = readRiskSettings(form.settings);
  const [draft, setDraft] = useState<RiskFormSettings | null>(saved);
  const [stale, setStale] = useState(false);
  const save = useSaveRiskRules();
  const lookups = useLookups();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  if (!draft || !saved) return <p className="text-sm text-muted-foreground">These rules could not be read. Reload the page.</p>;
  const thresholdError = validateThresholds(draft.method, draft.thresholds);
  const published = form.currentVersion > 0;
  const set = (patch: Partial<RiskFormSettings>) => setDraft({ ...draft, ...patch });
  const readOnly = !form.access.rules;

  async function submit() {
    if (!draft || thresholdError) return;
    try {
      const next = await save.mutateAsync({ id: form.id, settings: draft as unknown as Record<string, unknown>, expectedVersion: form.version });
      setStale(false);
      setDraft(readRiskSettings(next.settings));
      toast.success(published ? `Rules saved – published as version ${next.currentVersion}` : "Draft rules saved");
    } catch (error) {
      if (isStaleVersion(error)) setStale(true);
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b p-4">
        <CardTitle>Scoring & review rules</CardTitle>
        <CardDescription>
          {RISK_METHOD_LABELS[draft.method]} scoring. {published ? "Saving publishes a new version; assessments already started keep the rules they captured." : "Saved with the draft and used once the form is published."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {stale && <StaleVersionAlert draft={draft} draftName="risk-rules" onReload={() => { onReload(); setStale(false); }} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="rules-method">Scoring method</FieldLabel>
            <Input id="rules-method" value={RISK_METHOD_LABELS[draft.method]} disabled />
            <FieldDescription>Fixed when the form was created.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="rules-domain">Risk domain</FieldLabel>
            <Select value={draft.domain} onValueChange={(v) => set({ domain: v as RiskDomain })} disabled={readOnly}>
              <SelectTrigger id="rules-domain" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RISK_DOMAINS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {RISK_DOMAIN_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {draft.thresholds ? (
          <Field data-invalid={Boolean(thresholdError)}>
            <FieldLabel>Risk levels start at</FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              {(["medium", "high", "critical"] as const).map((band) => (
                <label key={band} className="space-y-1 text-xs font-medium capitalize text-muted-foreground">
                  {band}
                  <Input
                    type="number"
                    min={1}
                    max={METHOD_MAX_SCORE[draft.method]}
                    value={draft.thresholds![band]}
                    disabled={readOnly}
                    aria-invalid={Boolean(thresholdError)}
                    onChange={(e) => set({ thresholds: { ...draft.thresholds!, [band]: e.target.value === "" ? 0 : Number(e.target.value) } })}
                  />
                </label>
              ))}
            </div>
            <FieldDescription>Scores at or above a value get that level. Highest possible score: {METHOD_MAX_SCORE[draft.method]}.</FieldDescription>
            <FieldError errors={thresholdError ? [{ message: thresholdError }] : []} />
          </Field>
        ) : (
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" /> Checklist scoring has no numeric levels: an assessment is Satisfactory, or Action required when any hazard is answered No.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="rules-review">Review frequency</FieldLabel>
            <Select value={String(draft.reviewMonths)} onValueChange={(v) => set({ reviewMonths: Number(v) })} disabled={readOnly}>
              <SelectTrigger id="rules-review" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVIEW_FREQUENCIES.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {reviewFrequencyLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="rules-notice">Remind before review (days)</FieldLabel>
            <Input
              id="rules-notice"
              type="number"
              min={0}
              max={365}
              value={draft.advanceNoticeDays}
              disabled={readOnly}
              onChange={(e) => set({ advanceNoticeDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="rules-sites">Available at sites</FieldLabel>
          <MultiSelect id="rules-sites" options={(lookups.data?.sites ?? []).map((s) => ({ value: s.id, label: s.name }))} value={draft.siteIds} onChange={(siteIds) => set({ siteIds })} placeholder="All sites" disabled={readOnly} />
          <FieldDescription>None selected = every site.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="rules-footnote">Assessment footnote</FieldLabel>
          <Textarea id="rules-footnote" rows={2} value={draft.footnote} disabled={readOnly} onChange={(e) => set({ footnote: e.target.value })} />
        </Field>

        {!readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {blocked && <span className="text-sm text-muted-foreground">Save or discard your question changes first.</span>}
            <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => setDraft(saved)}>
              Discard
            </Button>
            <Button disabled={!dirty || blocked || Boolean(thresholdError) || save.isPending} onClick={() => void submit()}>
              {save.isPending && <Spinner />} {published ? `Save rules & publish v${form.currentVersion + 1}` : "Save rules"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
