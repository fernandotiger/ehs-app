import { mergeSeedAnswers, orFresh, pickChanged, pickSeedAnswers, seedEnum, seedId, seedObject, seedText, seedTextOrNull } from "@/lib/favourites/seed";
import { repeatedDefaultKeys, type FormFieldDefinition, type FormValues } from "@/lib/forms";
import { SEVERITIES } from "@/lib/incidents";
import type { ReportSetupTypeDto } from "../../api";
import type { ReportValues } from "./report-wizard";
import { applyTypeChoice, type TypeChoice } from "./type-choice";

/**
 * Report incident – what a favourite keeps (brief 09 §2B): the type and the "What & where" fields
 * the reporter typed (title, severity, department, precise location, shift, what happened, and the
 * text / choice answers of the type's Report form).
 *
 * Never kept: the date and time of the event and the investigation target (they describe this event),
 * people, first aid, investigators, people to notify, confidential, files, `clientId` and
 * "Report anonymously" – while that is on, the wizard switches capture off altogether.
 */

/** Questions the wizard asks with its own fields (never part of the custom answers). */
export const REPORT_SYSTEM_KEYS: readonly string[] = ["incidentTitle", "occurredAt", "site", "whatHappened"];

const KEPT = ["typeId", "subtypeId", "title", "severity", "departmentId", "preciseLocation", "shift", "narrative"] as const satisfies readonly (keyof ReportValues)[];

export type ReportSeed = Partial<Pick<ReportValues, (typeof KEPT)[number]>> & { answers?: FormValues };

/** The custom questions of a type's Report form (all sites) – the ones a seed may answer. */
export function reportSeedFields(type: Pick<ReportSetupTypeDto, "reportFormVersion">): FormFieldDefinition[] {
  const fields = type.reportFormVersion?.fields ?? [];
  const hidden = new Set([...REPORT_SYSTEM_KEYS, ...repeatedDefaultKeys(fields, "REPORT")]);
  return fields.filter((f) => !hidden.has(f.key));
}

/** Capture: what the reporter changed from the fresh form. `fields` = the custom questions shown now. */
export function pickReport(values: ReportValues, fresh: ReportValues, fields: readonly FormFieldDefinition[]): ReportSeed {
  const seed: ReportSeed = pickChanged(values, fresh, KEPT);
  if (!values.typeId) {
    delete seed.typeId;
    delete seed.subtypeId;
  }
  const answers = pickSeedAnswers(fields, values.answers);
  if (Object.keys(answers).length) seed.answers = answers;
  return seed;
}

export interface ReportMergeContext {
  /** Incident types offered for new reports now (with their published Report form). */
  types: readonly (TypeChoice & Pick<ReportSetupTypeDto, "reportFormVersion">)[];
  /** Departments that exist now (unknown → no check). */
  departmentIds?: readonly string[];
}

/**
 * Restore: the kept values on top of a fresh form. A type that is no longer offered is dropped with
 * its subtype and answers (the wizard then opens on the type step); answers are filtered to the type's
 * current questions. Dates stay "now"-based, `anonymous` stays off.
 */
export function mergeReport(fresh: ReportValues, saved: unknown, context: ReportMergeContext): { values: ReportValues; typeKept: boolean } {
  const s = seedObject(saved) ?? {};
  let values: ReportValues = {
    ...fresh,
    title: seedText(s.title, 200) ?? fresh.title,
    severity: seedEnum(s.severity, SEVERITIES) ?? fresh.severity,
    departmentId: orFresh(seedId(s.departmentId, context.departmentIds), fresh.departmentId),
    preciseLocation: seedText(s.preciseLocation, 200) ?? fresh.preciseLocation,
    shift: orFresh(seedTextOrNull(s.shift, 120), fresh.shift),
    narrative: seedText(s.narrative, 10_000) ?? fresh.narrative,
  };
  const typeId = seedId(s.typeId);
  const type = typeId ? context.types.find((t) => t.id === typeId) : undefined;
  if (!type) return { values, typeKept: false };
  values = applyTypeChoice(values, type, { editing: false, rememberedSubtypeId: seedId(s.subtypeId) });
  return { values: { ...values, answers: mergeSeedAnswers(s.answers, reportSeedFields(type)) }, typeKept: true };
}
