"use client";

import type { RiskFormSettings } from "@/lib/forms/settings";
import { RISK_BAND_LABELS, riskBand } from "@/lib/risk/scoring";
import { cn } from "@/lib/utils";
import { classify, matrixCell } from "@/server/modules/risk/scoring";
import { BAND_CELL, BAND_CLASSES } from "../../format";
import { LIKELIHOOD_LABELS, SEVERITY_LABELS } from "./hazard-editor";

interface HeatHazard {
  name: string;
  likelihood: number | null;
  severity: number | null;
  score: number | null;
}

/**
 * Likelihood × severity heat-map (5×5 / 3×3) with the hazards placed by number. Cell colours
 * follow the captured boundaries. FMEA / Checklist show their hazards as a ranked list instead.
 */
export function HeatMap({ rules, hazards }: { rules: RiskFormSettings; hazards: HeatHazard[] }) {
  if (rules.method !== "5x5" && rules.method !== "3x3") return <RankedList rules={rules} hazards={hazards} />;
  const method = rules.method;
  const size = method === "5x5" ? 5 : 3;
  const cells = new Map<string, number[]>();
  hazards.forEach((h, i) => {
    const cell = matrixCell(method, h);
    if (!cell) return;
    const key = `${cell.likelihood}:${cell.severity}`;
    cells.set(key, [...(cells.get(key) ?? []), i + 1]);
  });
  const severities = Array.from({ length: size }, (_, i) => size - i);
  const likelihoods = Array.from({ length: size }, (_, i) => i + 1);
  return (
    <figure className="space-y-2">
      <div className="flex gap-2">
        <div className="flex w-5 items-center justify-center">
          <span className="-rotate-90 whitespace-nowrap text-xs text-muted-foreground">Severity</span>
        </div>
        <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `auto repeat(${size}, minmax(0, 1fr))` }} role="table" aria-label="Risk heat-map">
          {severities.map((s) => (
            <div key={s} className="contents" role="row">
              <div className="flex items-center justify-end pr-1 text-[11px] text-muted-foreground" role="rowheader" title={SEVERITY_LABELS[method][s - 1]}>
                {s}
              </div>
              {likelihoods.map((l) => {
                const band = riskBand(l * s, method, rules.thresholds);
                const marks = cells.get(`${l}:${s}`) ?? [];
                return (
                  <div
                    key={l}
                    role="cell"
                    className={cn("flex aspect-[4/3] min-h-9 flex-wrap items-center justify-center gap-0.5 rounded-md p-0.5 text-[11px] text-foreground/60", BAND_CELL[band])}
                    title={`Likelihood ${l} × severity ${s} = ${l * s} (${RISK_BAND_LABELS[band]})`}
                  >
                    {marks.length ? (
                      marks.map((m) => (
                        <span key={m} className="flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                          {m}
                        </span>
                      ))
                    ) : (
                      <span className="tabular-nums">{l * s}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div />
          {likelihoods.map((l) => (
            <div key={l} className="text-center text-[11px] text-muted-foreground" title={LIKELIHOOD_LABELS[method][l - 1]}>
              {l}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="text-center text-xs text-muted-foreground">Likelihood → · numbered dots are the hazards / aspects below</figcaption>
    </figure>
  );
}

function RankedList({ rules, hazards }: { rules: RiskFormSettings; hazards: HeatHazard[] }) {
  const max = rules.method === "FMEA" ? 1000 : 1;
  const ranked = hazards.map((h, i) => ({ ...h, n: i + 1 })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  if (!ranked.length) return <p className="py-6 text-center text-sm text-muted-foreground">No hazards or aspects yet.</p>;
  return (
    <ul className="space-y-2" aria-label={rules.method === "FMEA" ? "Risk priority numbers" : "Checklist results"}>
      {ranked.map((h) => {
        const band = classify(h.score, rules);
        return (
          <li key={h.n} className="grid grid-cols-[1.5rem_minmax(6rem,12rem)_1fr_auto] items-center gap-2 text-sm">
            <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">{h.n}</span>
            <span className="truncate" title={h.name}>
              {h.name || "Untitled"}
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", band ? BAND_CELL[band] : "bg-muted")} style={{ width: `${h.score === null ? 0 : Math.max(4, (h.score / max) * 100)}%` }} />
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", band ? BAND_CLASSES[band] : "text-muted-foreground")}>
              {h.score === null ? "—" : rules.method === "CHECKLIST" ? (band ? RISK_BAND_LABELS[band] : "—") : h.score}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
