import "server-only";
import { DUE_WORK_KIND_INFO, type DueWorkKind } from "@/lib/jobs";
import type { ModuleKey } from "@/lib/modules";
import { documentAcknowledgementProvider, documentSurveyProvider } from "@/server/modules/documents/due-work";
import { incidentActionProvider, incidentInvestigationProvider } from "@/server/modules/incidents/due-work";
import { riskReviewProvider, riskTaskProvider } from "@/server/modules/risk/due-work";
import type { DueWorkProvider } from "./types";

export type { DueWorkItem, DueWorkKind, DueWorkProvider } from "./types";

/**
 * Due-work provider registry (Registry pattern) – feeds scheduled jobs and My work.
 *
 * A module plugs in by implementing `DueWorkProvider` (usually `<module>/due-work.ts`) and adding
 * it below. Only modules that exist register: the Incident phase adds `incident.investigation` +
 * `incident.action`, the Risk phase `risk.review` + `risk.task`; `audit`, `inspection` and
 * `law.evaluation` stay declared (src/lib/jobs.ts) but unregistered until those modules ship.
 * Providers are called inside the tenant context (apiHandler / forEachTenant).
 */
const PROVIDERS: DueWorkProvider[] = [documentAcknowledgementProvider, documentSurveyProvider, incidentInvestigationProvider, incidentActionProvider, riskReviewProvider, riskTaskProvider];

export function dueWorkProvider(kind: DueWorkKind): DueWorkProvider | undefined {
  return PROVIDERS.find((p) => p.kind === kind);
}

/** Registered providers whose module the tenant has enabled. */
export function activeProviders(enabledModules: readonly string[]): DueWorkProvider[] {
  return PROVIDERS.filter((p) => enabledModules.includes(p.module));
}

export interface JobTargetOption {
  kind: DueWorkKind;
  label: string;
  module: ModuleKey;
  /** Registered and the module is enabled. */
  available: boolean;
  /** Why it cannot be selected yet. */
  note?: string;
}

/** Every declared kind with its availability for the job editor. */
export function jobTargetOptions(enabledModules: readonly string[]): JobTargetOption[] {
  return Object.values(DUE_WORK_KIND_INFO).map((info) => {
    const provider = dueWorkProvider(info.kind);
    const moduleOn = enabledModules.includes(info.module);
    const available = Boolean(provider?.jobTarget) && moduleOn;
    const note = available ? undefined : !moduleOn ? "Module not enabled" : info.later ? "Comes with the module (later)" : "Comes with the module (next phase)";
    return { kind: info.kind, label: info.label, module: info.module, available, note };
  });
}
