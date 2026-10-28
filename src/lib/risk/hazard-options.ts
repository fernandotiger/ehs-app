import { z } from "zod";
import { normaliseLabel } from "@/lib/lookups";

/**
 * Hazard / aspect options of one Risk form (a "risk type" on Configuration → Risk matrix). They are
 * ordinary pick-list rows (`LookupValue`) under a per-form list key, so they get the usual active
 * flag, ordering and audit – but are managed on the Risk matrix page, not in Configuration → Lists.
 *
 * Assessments store the hazard's name as text, so renaming, switching off or removing an option
 * never changes an existing assessment.
 */
export const RISK_HAZARD_LIST_PREFIX = "risk.hazard:";

export function riskHazardListKey(formId: string): string {
  return `${RISK_HAZARD_LIST_PREFIX}${formId}`;
}

export const HAZARD_OPTION_MAX = 120;

const optionLabel = z.string().trim().min(1, "Enter a name").max(HAZARD_OPTION_MAX, `Keep it to ${HAZARD_OPTION_MAX} characters`);

export const hazardOptionCreateSchema = z.object({ label: optionLabel });
export type HazardOptionCreateInput = z.infer<typeof hazardOptionCreateSchema>;

export const hazardOptionUpdateSchema = z
  .object({ label: optionLabel.optional(), isActive: z.boolean().optional() })
  .refine((v) => v.label !== undefined || v.isActive !== undefined, { message: "Nothing to change" });
export type HazardOptionUpdateInput = z.infer<typeof hazardOptionUpdateSchema>;

export interface HazardOptionFacts {
  label: string;
  isActive: boolean;
}

/** The form offers a dropdown only while at least one option is switched on; otherwise the name is typed. */
export function usesHazardList(options: readonly HazardOptionFacts[]): boolean {
  return options.some((o) => o.isActive);
}

/**
 * Checks the hazard names of an assessment against its form's options. A new or changed name must be
 * an active option (stored with the option's spelling); a name the hazard already had stays valid even
 * if the option was renamed, switched off or removed since. Empty names are left to the workflow gates.
 * Without a list in use, names are free text.
 */
export function checkHazardNames(
  hazards: readonly { id: string | null; name: string }[],
  saved: ReadonlyMap<string, string>,
  options: readonly HazardOptionFacts[],
  word = "hazard",
): { names: string[]; problems: string[] } {
  const names = hazards.map((h) => h.name.trim());
  if (!usesHazardList(options)) return { names, problems: [] };
  const byKey = new Map(options.map((o) => [normaliseLabel(o.label), o]));
  const problems: string[] = [];
  hazards.forEach((h, i) => {
    const name = names[i]!;
    if (!name) return;
    const previous = h.id ? saved.get(h.id) : undefined;
    if (previous !== undefined && normaliseLabel(previous) === normaliseLabel(name)) {
      names[i] = previous;
      return;
    }
    const option = byKey.get(normaliseLabel(name));
    if (option?.isActive) names[i] = option.label;
    else if (option) problems.push(`The ${word} “${option.label}” has been switched off – choose another one from the list.`);
    else problems.push(`Choose the ${word} from the list – “${name}” is not in it.`);
  });
  return { names, problems };
}
