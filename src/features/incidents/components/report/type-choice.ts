import type { ReportSetupTypeDto } from "../../api";
import { addDaysLocal, todayLocal } from "../../format";

/** The parts of a report that depend on the incident type. */
export interface TypeChoiceValues {
  typeId: string;
  subtypeId: string | null;
  isConfidential: boolean;
  investigatorIds: string[];
  occurredAt: string;
  investigationTargetDate: string;
  targetTouched: boolean;
}

export type TypeChoice = Pick<ReportSetupTypeDto, "id" | "subtypes" | "defaultConfidential" | "multipleInvestigators" | "targetDays">;

/**
 * Choosing (or changing) the type in the report wizard. Everything not tied to the type is kept:
 * title, date, place, people and every questionnaire answer – answers to questions the new type's
 * form does not ask stay on the device and come back when the reporter switches back (the server
 * ignores them). The subtype is the one last chosen for that type, else its only active subtype.
 * Choosing the current type again changes nothing.
 */
export function applyTypeChoice<V extends TypeChoiceValues>(values: V, type: TypeChoice, options: { editing: boolean; rememberedSubtypeId?: string | null }): V {
  if (values.typeId === type.id) return values;
  const active = type.subtypes.filter((s) => s.isActive);
  const remembered = active.find((s) => s.id === options.rememberedSubtypeId);
  return {
    ...values,
    typeId: type.id,
    subtypeId: remembered?.id ?? (active.length === 1 ? active[0]!.id : null),
    isConfidential: options.editing ? values.isConfidential : type.defaultConfidential,
    investigatorIds: type.multipleInvestigators ? values.investigatorIds : values.investigatorIds.slice(0, 1),
    investigationTargetDate: values.targetTouched ? values.investigationTargetDate : addDaysLocal((values.occurredAt || todayLocal()).slice(0, 10), type.targetDays),
  };
}
