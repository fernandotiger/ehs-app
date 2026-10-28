import type { PrismaClient } from "../../src/generated/prisma/client";
import { readRiskSettings } from "../../src/lib/forms/settings";
import { riskHazardListKey } from "../../src/lib/risk/hazard-options";

/**
 * Demo hazard / aspect lists for the Risk forms (Configuration → Risk matrix → Hazards). Health &
 * Safety matrix forms get common hazards, Environment forms common aspects; Checklist forms keep a
 * typed name (their "hazards" are checklist items). The names already used by the demo assessments
 * are included, so they show as list choices. Idempotent: a form that already has options is left alone.
 */
export const DEMO_HAZARDS = [
  "Moving vehicles",
  "Poor visibility",
  "Working at height",
  "Fall from ladder",
  "Fall from roof edge",
  "Contact with moving parts",
  "Manual handling",
  "Repetitive lifting",
  "Slips, trips and falls",
  "Noise",
  "Vibration",
  "Hazardous substances",
  "Electricity",
  "Fire",
  "Hot work",
  "Confined spaces",
];

export const DEMO_ASPECTS = ["Release to surface water", "Vapour emissions", "Spill to ground", "Dust", "Noise to neighbours", "Waste generation", "Energy use", "Water use"];

export async function applyDemoRiskHazards(db: PrismaClient, organizationId: string): Promise<{ form: string; added: number }[]> {
  const forms = await db.formDefinition.findMany({ where: { organizationId, module: "risk" }, select: { id: true, name: true, purpose: true, settings: true } });
  const result: { form: string; added: number }[] = [];
  for (const form of forms) {
    if (form.purpose === "CHECKLIST") continue;
    const listKey = riskHazardListKey(form.id);
    if ((await db.lookupValue.count({ where: { organizationId, listKey } })) > 0) continue;
    const labels = readRiskSettings(form.settings)?.domain === "ENVIRONMENT" ? DEMO_ASPECTS : DEMO_HAZARDS;
    await db.lookupValue.createMany({ data: labels.map((label, sortOrder) => ({ organizationId, listKey, label, sortOrder })), skipDuplicates: true });
    result.push({ form: form.name, added: labels.length });
  }
  return result;
}
