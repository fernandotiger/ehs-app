"use client";

import { FormInput, Grid3x3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskRulesPanel } from "@/features/forms/components/risk-rules-panel";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { RISK_DOMAIN_LABELS, RISK_METHOD_LABELS, reviewFrequencyLabel, type RiskDomain } from "@/lib/risk/scoring";
import { cn } from "@/lib/utils";
import { useRiskMatrix, useRiskMatrixForm } from "../../api";
import { HazardListPanel } from "./hazard-list-panel";

/**
 * Configuration → Risk matrix & review rules. Lists the Risk forms; the selected form's rules are
 * edited with the Form Builder's rules panel (same service: a published form gets a new version,
 * existing assessments keep the rules they captured).
 */
export function RiskMatrixConfig() {
  const list = useRiskMatrix();
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedChangesGuard(dirty);
  const id = selected ?? list.data?.[0]?.id ?? null;
  const form = useRiskMatrixForm(id);

  return (
    <>
      {guard.dialog}
      <PageHeader
        title="Risk matrix & review rules"
        description="Medium / High / Critical starting values, review frequency, reminder notice, sites, footnote and hazard list of each Risk form."
        backHref="/configuration"
        backLabel="Configuration"
        actions={
          <Button asChild variant="outline">
            <Link href="/configuration/forms?module=risk">
              <FormInput /> Risk forms in Form Builder
            </Link>
          </Button>
        }
      />
      {list.isPending ? (
        <LoadingRows rows={4} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={Grid3x3} title="No Risk forms yet" description="Create a Risk form (5×5, 3×3, FMEA or checklist) in Form Builder – its scoring rules are edited here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_2fr]">
          <Card className="h-fit gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Risk forms</CardTitle>
              <CardDescription>Choose a form to inspect its method, rules and hazards.</CardDescription>
            </CardHeader>
            <ul className="divide-y">
              {list.data.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => guard.confirm(() => { setSelected(f.id); setDirty(false); })}
                    className={cn("w-full space-y-1 px-4 py-3 text-left hover:bg-muted/50", f.id === id && "bg-brand-soft/60")}
                    aria-current={f.id === id ? "true" : undefined}
                  >
                    <p className="text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {RISK_METHOD_LABELS[f.method]} · {RISK_DOMAIN_LABELS[f.domain as RiskDomain] ?? f.domain} · {f.currentVersion ? `v${f.currentVersion}` : "never published"} · {f.assessmentCount} assessment{f.assessmentCount === 1 ? "" : "s"}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge tone={f.status === "PUBLISHED" ? "success" : "warning"}>{f.status === "PUBLISHED" ? "Published" : "Draft changes"}</StatusBadge>
                      {f.settings?.thresholds && <StatusBadge>{`${f.settings.thresholds.medium} / ${f.settings.thresholds.high} / ${f.settings.thresholds.critical}`}</StatusBadge>}
                      {f.settings && <StatusBadge>{reviewFrequencyLabel(f.settings.reviewMonths)}</StatusBadge>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <div className="space-y-3">
            {form.isPending ? (
              <LoadingRows rows={4} />
            ) : form.isError ? (
              <ErrorState error={form.error} onRetry={() => form.refetch()} />
            ) : (
              <>
                <RiskRulesPanel key={`${form.data.id}:${form.data.version}`} form={form.data} blocked={false} onDirtyChange={setDirty} onReload={() => form.refetch()} />
                <HazardListPanel formId={form.data.id} domain={list.data.find((f) => f.id === form.data.id)?.domain ?? "HEALTH_SAFETY"} />
                <CardContent className="px-1 text-xs text-muted-foreground">
                  A company matrix reference image is an on-screen aid only in the specification – it never calculates scores, so it is not stored here.
                </CardContent>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
