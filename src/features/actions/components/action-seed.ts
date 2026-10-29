import { mergeSeedAnswers, orFresh, pickChanged, pickSeedAnswers, seedEnum, seedId, seedObject, seedText } from "@/lib/favourites/seed";
import { ACTION_PRIORITIES } from "@/lib/actions";
import type { FormFieldDefinition, FormValues } from "@/lib/forms";
import type { ActionFormValues } from "./action-form";

/**
 * Create Action – what a favourite keeps (brief 09 §2B): what needs to be done, details, who, priority,
 * where, the chosen "Type of action" form and its text / choice answers.
 *
 * Never kept: the due date (it is "now"-based – a fresh form suggests today + 14 days), file answers,
 * date answers and `clientId`.
 */

const KEPT = ["title", "description", "ownerId", "priority", "departmentId"] as const satisfies readonly (keyof ActionFormValues)[];

export type ActionSeed = Partial<Pick<ActionFormValues, (typeof KEPT)[number]>> & { formId?: string; formVersionId?: string; answers?: FormValues };

export interface ActionSeedForm {
  formId: string;
  versionId: string;
  fields: readonly FormFieldDefinition[];
}

/**
 * Capture: what the user changed from the fresh form. `form` = the extra-questions form shown now
 * (null when none); it is kept when it was chosen explicitly or has answers.
 */
export function pickAction(values: ActionFormValues, fresh: ActionFormValues, form: (ActionSeedForm & { chosen: boolean }) | null): ActionSeed {
  const seed: ActionSeed = pickChanged(values, fresh, KEPT);
  if (!form) return seed;
  const answers = pickSeedAnswers(form.fields, values.answers);
  if (Object.keys(answers).length) seed.answers = answers;
  if (seed.answers || form.chosen) {
    seed.formId = form.formId;
    seed.formVersionId = form.versionId;
  }
  return seed;
}

export interface ActionMergeResult {
  values: ActionFormValues;
  /** The extra-questions form to start on (the page falls back to the same form's current version, then to the first form). */
  form: { formId: string | null; versionId: string | null } | null;
}

/**
 * Restore: the kept values on top of a fresh form (the due date stays fresh). The extra questions load
 * after the page opens, so answers are only shape-checked here; the save keeps only answers to the
 * questions of the form shown (validateQuestionnaireAnswers).
 */
export function mergeAction(fresh: ActionFormValues, saved: unknown, context: { departmentIds?: readonly string[] } = {}): ActionMergeResult {
  const s = seedObject(saved) ?? {};
  const formId = seedId(s.formId) ?? null;
  const versionId = seedId(s.formVersionId) ?? null;
  const form = formId || versionId ? { formId, versionId } : null;
  return {
    values: {
      ...fresh,
      title: seedText(s.title, 200) ?? fresh.title,
      description: seedText(s.description, 5000) ?? fresh.description,
      ownerId: seedId(s.ownerId) ?? fresh.ownerId,
      priority: seedEnum(s.priority, ACTION_PRIORITIES) ?? fresh.priority,
      departmentId: orFresh(seedId(s.departmentId, context.departmentIds), fresh.departmentId),
      answers: form ? mergeSeedAnswers(s.answers) : {},
    },
    form,
  };
}
