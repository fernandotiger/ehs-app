import { mergeSeedAnswers, orFresh, pickChanged, pickSeedAnswers, seedId, seedIds, seedInt, seedEnum, seedObject, seedText, seedTextOrNull } from "@/lib/favourites/seed";
import type { FormFieldDefinition, FormValues } from "@/lib/forms";
import { readRiskSettings } from "@/lib/forms/settings";
import { addMonths, CHECKLIST_RESULTS } from "@/lib/risk/labels";
import type { AssessmentWizardValues } from "./assessment-wizard";
import type { HazardDraft } from "./hazard-editor";

/**
 * New risk assessment – what a favourite keeps (brief 09 §2B): the Scope step (Risk form, title,
 * activity, department, responsible person, approver, participants, item details, people exposed /
 * impact context, text / choice answers) and the hazards / aspects.
 *
 * Never kept: the review date (a fresh one is suggested from the form's review rules), confidential,
 * file and date answers, existing hazard ids and `clientId`. Scores only come back when the same form
 * version is still published (another version may score differently).
 */

const KEPT = [
  "title",
  "description",
  "departmentId",
  "ownerId",
  "approverId",
  "participantIds",
  "itemType",
  "itemIdentity",
  "operationMode",
  "workArea",
  "peopleExposed",
  "impactContext",
] as const satisfies readonly (keyof AssessmentWizardValues)[];

type KeptHazard = Omit<HazardDraft, "key" | "id">;

export type AssessmentSeed = Partial<Pick<AssessmentWizardValues, (typeof KEPT)[number]>> & {
  formId?: string;
  formVersionId?: string;
  hazards?: KeptHazard[];
  answers?: FormValues;
};

const HAZARD_TEXT = ["activity", "name", "consequence", "controls", "recommendation", "justification"] as const;
const HAZARD_TEXT_MAX: Record<(typeof HAZARD_TEXT)[number], number> = { activity: 500, name: 300, consequence: 2000, controls: 5000, recommendation: 5000, justification: 2000 };
const MAX_HAZARDS = 100;

function hazardIsBlank(h: KeptHazard): boolean {
  return HAZARD_TEXT.every((k) => !h[k].trim()) && h.likelihood === null && h.severity === null && !Object.keys(h.factors).length && h.checklistResult === null;
}

/**
 * Capture: what the user changed from the fresh form. `form` = the chosen Risk form (id + version)
 * and its custom questions shown now.
 */
export function pickAssessment(values: AssessmentWizardValues, fresh: AssessmentWizardValues, form: { formId: string | null; fields: readonly FormFieldDefinition[] }): AssessmentSeed {
  const seed: AssessmentSeed = pickChanged(values, fresh, KEPT);
  if (values.formVersionId) {
    seed.formVersionId = values.formVersionId;
    if (form.formId) seed.formId = form.formId;
  }
  const hazards = values.hazards
    .map(
      (h): KeptHazard => ({
        activity: h.activity,
        name: h.name,
        consequence: h.consequence,
        controls: h.controls,
        recommendation: h.recommendation,
        justification: h.justification,
        likelihood: h.likelihood,
        severity: h.severity,
        factors: h.factors,
        checklistResult: h.checklistResult,
      }),
    )
    .filter((h) => !hazardIsBlank(h));
  if (hazards.length) seed.hazards = hazards;
  const answers = pickSeedAnswers(form.fields, values.answers);
  if (Object.keys(answers).length) seed.answers = answers;
  return seed;
}

export interface AssessmentMergeContext {
  /** Risk forms published now (current versions). */
  forms: readonly { formId: string; versionId: string; settings: Record<string, unknown> }[];
  /** Today (YYYY-MM-DD) – the suggested review date counts from it. */
  today: string;
  /** Departments that exist now (unknown → no check). */
  departmentIds?: readonly string[];
}

function mergeHazard(value: unknown, keepScores: boolean): HazardDraft | null {
  const h = seedObject(value);
  if (!h) return null;
  const hazard: HazardDraft = {
    key: crypto.randomUUID(),
    activity: "",
    name: "",
    consequence: "",
    controls: "",
    recommendation: "",
    justification: "",
    likelihood: null,
    severity: null,
    factors: {},
    checklistResult: null,
  };
  for (const k of HAZARD_TEXT) hazard[k] = seedText(h[k], HAZARD_TEXT_MAX[k]) ?? "";
  if (keepScores) {
    hazard.likelihood = seedInt(h.likelihood, 0, 10) ?? null;
    hazard.severity = seedInt(h.severity, 0, 10) ?? null;
    hazard.checklistResult = seedEnum(h.checklistResult, CHECKLIST_RESULTS) ?? null;
    const factors = seedObject(h.factors) ?? {};
    for (const [name, score] of Object.entries(factors)) {
      const n = seedInt(score, 1, 10);
      if (n !== undefined && name.length <= 40) hazard.factors[name] = n;
    }
  }
  return hazardIsBlank(hazard) ? null : hazard;
}

/**
 * Restore: the kept values on top of a fresh form; the wizard opens on Scope. The Risk form must still
 * be published: the same version keeps answers and scores; a newer version of the same form keeps the
 * form choice and the hazard texts only; a form that is gone is dropped with its answers and scores.
 */
export function mergeAssessment(fresh: AssessmentWizardValues, saved: unknown, context: AssessmentMergeContext): AssessmentWizardValues {
  const s = seedObject(saved) ?? {};
  const versionId = seedId(s.formVersionId);
  const formId = seedId(s.formId);
  const exact = versionId ? context.forms.find((f) => f.versionId === versionId) : undefined;
  const form = exact ?? (formId ? context.forms.find((f) => f.formId === formId) : undefined);
  const rules = form ? readRiskSettings(form.settings) : null;
  const hazards = (Array.isArray(s.hazards) ? s.hazards : [])
    .slice(0, MAX_HAZARDS)
    .map((h) => mergeHazard(h, Boolean(exact)))
    .filter((h): h is HazardDraft => h !== null);
  return {
    ...fresh,
    formVersionId: form?.versionId ?? fresh.formVersionId,
    // As when choosing the form by hand: the review date the form's rules suggest from today.
    reviewDate: rules ? addMonths(context.today, rules.reviewMonths) : fresh.reviewDate,
    reviewTouched: false,
    title: seedText(s.title, 200) ?? fresh.title,
    description: seedText(s.description, 5000) ?? fresh.description,
    departmentId: orFresh(seedId(s.departmentId, context.departmentIds), fresh.departmentId),
    ownerId: orFresh(seedId(s.ownerId), fresh.ownerId),
    approverId: orFresh(seedId(s.approverId), fresh.approverId),
    participantIds: seedIds(s.participantIds, 50) ?? fresh.participantIds,
    itemType: orFresh(seedTextOrNull(s.itemType, 120), fresh.itemType),
    itemIdentity: seedText(s.itemIdentity, 200) ?? fresh.itemIdentity,
    operationMode: orFresh(seedTextOrNull(s.operationMode, 120), fresh.operationMode),
    workArea: orFresh(seedTextOrNull(s.workArea, 120), fresh.workArea),
    peopleExposed: seedText(s.peopleExposed, 2000) ?? fresh.peopleExposed,
    impactContext: seedText(s.impactContext, 2000) ?? fresh.impactContext,
    hazards: hazards.length ? hazards : fresh.hazards,
    answers: exact ? mergeSeedAnswers(s.answers) : {},
  };
}
